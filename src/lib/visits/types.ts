export type ColorByMode = "area" | "technician" | "crew" | "division";

export type ScheduleFilters = {
  serviceAreaIds: string[];
  userIds: string[];
  crewIds: string[];
  divisions: ("INSTALL" | "SERVICE")[];
};

export const DEFAULT_SCHEDULE_FILTERS: ScheduleFilters = {
  serviceAreaIds: [],
  userIds: [],
  crewIds: [],
  divisions: [],
};

export type VisitDTO = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  division: "INSTALL" | "SERVICE";
  status: string;
  tags: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  property: { id: string; name: string; address: string | null } | null;
  serviceArea: { id: string; name: string; color: string };
  assignedUser: {
    id: string;
    name: string;
    color: string | null;
    photoUrl: string | null;
  } | null;
  crew: { id: string; name: string; color: string } | null;
  subtotal?: number;
  total?: number;
};

export type ScheduleJobDTO = VisitDTO;
