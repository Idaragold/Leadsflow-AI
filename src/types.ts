export interface User {
  id: string;
  name: string;
  email: string;
  plan: 'Free' | 'Basic' | 'Growth' | 'Premium';
  paymentStatus: boolean;
}

export interface Business {
  id: string;
  name: string;
  type: 'barber' | 'salon' | 'laundry' | 'hotel';
  location: string;
  ownerId: string;
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  serviceNeeded: string;
  businessId: string;
  ownerId: string;
  status: 'New' | 'Contacted' | 'Converted';
  outreachMessage?: string;
}

export interface Campaign {
  id: string;
  title: string;
  content: any;
  businessId: string;
  ownerId: string;
  scheduledTime: string;
  metrics?: {
    clicks: number;
    engagement: number;
    reach: number;
  };
}
