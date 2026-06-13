export type ScheduleJob = {
  id: string;
  dayIndex: number;
  startHour: number;
  durationHours: number;
  lane: number;
  location: string;
  timeWindow: string;
  techInitials: string;
  color: string;
};

export const scheduleWeekLabel = "June 07-13, 2026";
export const weeklyRevenue = "$12,450.00";
export const weeklyScheduledHours = "42h 30m";

export const scheduleDays = [
  { label: "Sun", date: "07", area: "Orem, UT", shift: "08:00 AM - 05:00 PM" },
  { label: "Mon", date: "08", area: "Provo, UT", shift: "08:00 AM - 05:00 PM" },
  { label: "Tue", date: "09", area: "Lehi, UT", shift: "08:00 AM - 05:00 PM" },
  { label: "Wed", date: "10", area: "American Fork, UT", shift: "08:00 AM - 05:00 PM" },
  { label: "Thu", date: "11", area: "Sandy, UT", shift: "08:00 AM - 05:00 PM" },
  { label: "Fri", date: "12", area: "Draper, UT", shift: "08:00 AM - 05:00 PM" },
  { label: "Sat", date: "13", area: "Orem, UT", shift: "08:00 AM - 02:00 PM" },
];

export const scheduleHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export const scheduleJobs: ScheduleJob[] = [
  {
    id: "1",
    dayIndex: 1,
    startHour: 8,
    durationHours: 3,
    lane: 0,
    location: "Orem, UT",
    timeWindow: "8:00-11:00am",
    techInitials: "JD",
    color: "bg-blue-100 border-blue-300",
  },
  {
    id: "2",
    dayIndex: 1,
    startHour: 9,
    durationHours: 2,
    lane: 1,
    location: "Provo, UT",
    timeWindow: "9:00-11:00am",
    techInitials: "MK",
    color: "bg-green-100 border-green-300",
  },
  {
    id: "3",
    dayIndex: 2,
    startHour: 8,
    durationHours: 4,
    lane: 0,
    location: "Lehi, UT",
    timeWindow: "8:00-12:00pm",
    techInitials: "JD",
    color: "bg-purple-100 border-purple-300",
  },
  {
    id: "4",
    dayIndex: 3,
    startHour: 10,
    durationHours: 2,
    lane: 0,
    location: "AF, UT",
    timeWindow: "10:00-12:00pm",
    techInitials: "TS",
    color: "bg-amber-100 border-amber-300",
  },
  {
    id: "5",
    dayIndex: 4,
    startHour: 8,
    durationHours: 3,
    lane: 0,
    location: "Sandy, UT",
    timeWindow: "8:00-11:00am",
    techInitials: "MK",
    color: "bg-blue-100 border-blue-300",
  },
  {
    id: "6",
    dayIndex: 4,
    startHour: 13,
    durationHours: 2,
    lane: 0,
    location: "Draper, UT",
    timeWindow: "1:00-3:00pm",
    techInitials: "JD",
    color: "bg-green-100 border-green-300",
  },
  {
    id: "7",
    dayIndex: 5,
    startHour: 9,
    durationHours: 3,
    lane: 0,
    location: "Highland, UT",
    timeWindow: "9:00-12:00pm",
    techInitials: "TS",
    color: "bg-purple-100 border-purple-300",
  },
];
