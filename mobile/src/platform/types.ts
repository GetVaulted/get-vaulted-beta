export type SupportCategory =
  | 'order'
  | 'shipping'
  | 'payment'
  | 'trade'
  | 'live'
  | 'account'
  | 'bug'
  | 'report_user'
  | 'other';

export type SupportTicketStatus = 'submitted' | 'in_progress' | 'resolved' | 'closed';

export type SupportTicket = {
  id: string;
  userId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  contactEmail: string;
  referenceType?: string;
  referenceId?: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
};

export type DisputeType =
  | 'not_received'
  | 'not_as_described'
  | 'damaged'
  | 'counterfeit'
  | 'payment'
  | 'trade_issue'
  | 'other';

export type DisputeStatus =
  | 'submitted'
  | 'under_review'
  | 'waiting_response'
  | 'resolved'
  | 'closed';

export type DisputeContextType = 'order' | 'trade' | 'marketplace' | 'live';

export type Dispute = {
  id: string;
  userId: string;
  contextType: DisputeContextType;
  disputeType: DisputeType;
  referenceId?: string;
  explanation: string;
  preferredResolution: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
};

export type ReviewType = 'buyer_to_seller' | 'seller_to_buyer' | 'trade' | 'live_show';

export type UserReview = {
  id: string;
  authorId: string;
  subjectUserId: string;
  rating: number;
  body: string;
  tags: string[];
  reviewType: ReviewType;
  referenceId?: string;
  createdAt: string;
};

export type PublicProfileStats = {
  followerCount: number;
  followingCount: number;
  reviewCount: number;
  averageRating: number;
  completedSales: number;
  completedTrades: number;
  liveShowsHosted: number;
};

export type AccountDeletionBlocker = {
  code: 'active_trade' | 'open_dispute' | 'pending_payout' | 'open_order';
  message: string;
};
