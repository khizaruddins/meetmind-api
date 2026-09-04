export interface BillingCustomer {
  id: string;
  email: string;
  name?: string;
}

export interface CheckoutSessionOptions {
  userId: string;
  email: string;
  planCode: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface BillingSubscriptionResult {
  id: string;
  customerId: string;
  planCode: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface BillingInvoiceResult {
  id: string;
  invoiceNumber: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface BillingPaymentMethodResult {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface BillingProvider {
  name: string;
  createCustomer(userId: string, email: string, name?: string): Promise<string>;
  createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult>;
  createPortalSession(customerId: string, returnUrl?: string): Promise<PortalSessionResult>;
  createSubscription(customerId: string, planCode: string): Promise<BillingSubscriptionResult>;
  changeSubscription(subscriptionId: string, newPlanCode: string): Promise<BillingSubscriptionResult>;
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<BillingSubscriptionResult>;
  resumeSubscription(subscriptionId: string): Promise<BillingSubscriptionResult>;
  getSubscription(subscriptionId: string): Promise<BillingSubscriptionResult | null>;
  getInvoice(invoiceId: string): Promise<BillingInvoiceResult | null>;
  listInvoices(customerId: string): Promise<BillingInvoiceResult[]>;
  listPaymentMethods(customerId: string): Promise<BillingPaymentMethodResult[]>;
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<boolean>;
  verifyWebhook(payload: Buffer | string, signature: string): Promise<{ eventId: string; type: string; data: any }>;
}
