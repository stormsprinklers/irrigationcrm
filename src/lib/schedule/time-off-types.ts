export type WorkScheduleDayDTO = {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type TimeOffRequestDTO = {
  id: string;
  userId: string;
  userName: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  type: string;
  status: string;
  reason: string | null;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdByName: string;
  createdAt: string;
};
