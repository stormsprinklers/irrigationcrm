export type InboxThread = {
  id: string;
  initials: string;
  name: string;
  snippet: string;
  timestamp: string;
  unreadCount?: number;
};

export const inboxThreads: InboxThread[] = [
  {
    id: "1",
    initials: "SA",
    name: "Soy Ariuka & 5 others",
    snippet: "Thanks for the quick response on the backflow repair...",
    timestamp: "Just now",
    unreadCount: 34,
  },
  {
    id: "2",
    initials: "HH",
    name: "Hansen Home Services",
    snippet: "Can we reschedule the spring startup for next week?",
    timestamp: "11:29 AM",
    unreadCount: 23,
  },
  {
    id: "3",
    initials: "GG",
    name: "Green Gardens LLC",
    snippet: "Invoice #4521 has been paid. Thank you!",
    timestamp: "10:15 AM",
    unreadCount: 11,
  },
  {
    id: "4",
    initials: "MR",
    name: "Mike Rodriguez",
    snippet: "The controller is still showing an error code...",
    timestamp: "Yesterday",
    unreadCount: 3,
  },
  {
    id: "5",
    initials: "LP",
    name: "Lisa Park",
    snippet: "Please send over the estimate for the drip system.",
    timestamp: "Yesterday",
  },
  {
    id: "6",
    initials: "TW",
    name: "Thompson HOA Board",
    snippet: "Monthly maintenance visit confirmed for the 15th.",
    timestamp: "Jun 11",
    unreadCount: 2,
  },
  {
    id: "7",
    initials: "JC",
    name: "James Chen",
    snippet: "Head replacement completed. All zones tested OK.",
    timestamp: "Jun 10",
  },
  {
    id: "8",
    initials: "AF",
    name: "Amanda Foster",
    snippet: "Winterization appointment request for October.",
    timestamp: "Jun 9",
  },
];
