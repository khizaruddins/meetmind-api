import { Injectable, NotFoundException } from '@nestjs/common';
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

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
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

  async sendInvoice(invoiceId: string, adminId: string) {
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.user) {
      await this.emailService.sendEmail({
        to: invoice.user.email,
        subject: `Invoice ${invoice.invoiceNumber} from Meeting Recorder`,
        template: 'invoice-send',
        context: { invoiceNumber: invoice.invoiceNumber, amountDue: invoice.amountDue },
      });
    }

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'invoice.send',
      entityType: 'INVOICE',
      entityId: invoiceId,
    });

    return { success: true, message: `Invoice sent to ${invoice.user.email}` };
  }
}
