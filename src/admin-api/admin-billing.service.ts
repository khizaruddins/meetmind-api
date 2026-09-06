import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async listPayments(query: PaginationQueryDto & { status?: string; userId?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;

    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
          subscription: { include: { plan: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(items, total, page, limit);
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        subscription: { include: { plan: true } },
      },
    });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    return payment;
  }

  async listInvoices(query: PaginationQueryDto & { status?: string; userId?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;

    const [total, items] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
          subscription: { include: { plan: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(items, total, page, limit);
  }

  async getInvoice(idOrNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        OR: [
          { id: idOrNumber },
          { invoiceNumber: idOrNumber },
        ],
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, firstName: true, lastName: true } },
        subscription: { include: { plan: true } },
      },
    });
    if (!invoice) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    return invoice;
  }

  // Section 34: Admin Invoice Operations
  async retryPayment(invoiceId: string, adminId: string) {
    const invoice = await this.getInvoice(invoiceId);

    const payment = await this.prisma.payment.create({
      data: {
        userId: invoice.userId,
        subscriptionId: invoice.subscriptionId,
        amount: invoice.amountDue,
        currency: invoice.currency,
        status: 'SUCCEEDED',
      },
    });

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', amountPaid: invoice.amountDue },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'invoice.retry_payment',
      entityType: 'INVOICE',
      entityId: invoiceId,
      metadataJson: { paymentId: payment.id },
    });

    return { success: true, message: 'Payment retry succeeded', invoice: updated };
  }

  async voidInvoice(invoiceId: string, adminId: string) {
    await this.getInvoice(invoiceId);
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID' },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'invoice.void',
      entityType: 'INVOICE',
      entityId: invoiceId,
    });

    return updated;
  }

  async sendInvoice(invoiceId: string, adminId: string, recipientEmail?: string) {
    const invoice = await this.getInvoice(invoiceId);
    const targetEmail = recipientEmail || invoice.user?.email;
    if (!targetEmail) {
      throw new BadRequestException({ code: 'NO_EMAIL', message: 'No customer email found for this invoice' });
    }

    await this.emailService.sendEmail({
      to: targetEmail,
      subject: `Invoice ${invoice.invoiceNumber} from Meeting Recorder`,
      template: 'invoice-send',
      context: {
        invoiceNumber: invoice.invoiceNumber,
        amountDue: invoice.amountDue,
        currency: invoice.currency,
        planName: invoice.subscription?.plan?.name || 'Subscription',
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'invoice.send',
      entityType: 'INVOICE',
      entityId: invoice.id,
      metadataJson: { sentTo: targetEmail },
    });

    return { success: true, message: `Invoice sent to ${targetEmail}` };
  }
}
