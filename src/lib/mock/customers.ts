export type Customer = {
  id: string;
  name: string;
  company: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  leadSource: string;
};

export const customers: Customer[] = [
  {
    id: "1",
    name: "James Anderson",
    company: "Anderson Landscaping",
    address: "1245 Maple Street",
    city: "Orem",
    state: "UT",
    zip: "84057",
    phone: "(801) 555-0142",
    email: "james@andersonland.com",
    leadSource: "Referral",
  },
  {
    id: "2",
    name: "Sarah Mitchell",
    company: "Mitchell Properties",
    address: "892 Oak Avenue",
    city: "Provo",
    state: "UT",
    zip: "84604",
    phone: "(801) 555-0198",
    email: "sarah@mitchellprops.com",
    leadSource: "Google",
  },
  {
    id: "3",
    name: "Robert Chen",
    company: "Chen Commercial",
    address: "456 Business Park Dr",
    city: "Lehi",
    state: "UT",
    zip: "84043",
    phone: "(801) 555-0234",
    email: "robert@chencomm.com",
    leadSource: "Website",
  },
  {
    id: "4",
    name: "Emily Rodriguez",
    company: "",
    address: "789 Pine Road",
    city: "American Fork",
    state: "UT",
    zip: "84003",
    phone: "(801) 555-0267",
    email: "emily.r@email.com",
    leadSource: "Facebook",
  },
  {
    id: "5",
    name: "Michael Thompson",
    company: "Thompson HOA",
    address: "321 Community Blvd",
    city: "Sandy",
    state: "UT",
    zip: "84070",
    phone: "(801) 555-0312",
    email: "mike@thompsonhoa.org",
    leadSource: "Referral",
  },
  {
    id: "6",
    name: "Lisa Park",
    company: "Park Gardens",
    address: "567 Garden Lane",
    city: "Draper",
    state: "UT",
    zip: "84020",
    phone: "(801) 555-0345",
    email: "lisa@parkgardens.com",
    leadSource: "Yelp",
  },
  {
    id: "7",
    name: "David Wilson",
    company: "",
    address: "234 Summit Drive",
    city: "Highland",
    state: "UT",
    zip: "84003",
    phone: "(801) 555-0378",
    email: "dwilson@email.com",
    leadSource: "Direct mail",
  },
  {
    id: "8",
    name: "Jennifer Adams",
    company: "Adams Estate",
    address: "890 Estate Way",
    city: "Alpine",
    state: "UT",
    zip: "84004",
    phone: "(801) 555-0401",
    email: "jen@adamsestate.com",
    leadSource: "Referral",
  },
  {
    id: "9",
    name: "Chris Martinez",
    company: "Martinez Farms",
    address: "112 Farm Road",
    city: "Pleasant Grove",
    state: "UT",
    zip: "84062",
    phone: "(801) 555-0434",
    email: "chris@martinezfarms.com",
    leadSource: "Google",
  },
  {
    id: "10",
    name: "Amanda Foster",
    company: "",
    address: "445 Willow Creek",
    city: "Lindon",
    state: "UT",
    zip: "84042",
    phone: "(801) 555-0467",
    email: "afoster@email.com",
    leadSource: "Website",
  },
];

export const customerRecordCount = 1882;
