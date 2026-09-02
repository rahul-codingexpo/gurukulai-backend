/**
 * Valid dashboard nav section (tab) IDs that can be assigned via Control Panel.
 * Keep in sync with frontend NAV_ITEMS children in Dashboardpagejson.js
 */
export const ASSIGNABLE_SECTION_IDS = [
  // School Management
  "sm-dashboard",
  "sm-gallery",
  "sm-class",
  "sm-session",
  "sm-id-card-template",
  "sm-settings",
  // School Academic
  "sa-dashboard",
  "sa-manage-classes",
  "sa-manage-section",
  "sa-subjects",
  "sa-class-timetable",
  "sa-staff-timetable",
  "sa-timetable-template",
  "sa-attendance",
  "sa-student-leaves",
  "sa-study-materials",
  "sa-homework",
  "sa-event",
  "sa-live-classes",
  "sa-tc",
  "sa-exam-setup",
  "sa-exam-program",
  "sa-admit-card",
  "sa-exam-attendance",
  "sa-marksheet",
  // Student
  "st-dashboard",
  "st-admission",
  "st-students",
  "st-studentattendance",
  "st-printidcard",
  "st-promote",
  // Roles
  "ro-dashboard",
  "ro-stafflist",
  "ro-staffsalary",
  "ro-staffattendance",
  "ro-staffleaves",
  "ro-Staffidcards",
  // Accounting
  "ac-dashboard",
  "ac-feetypes",
  "ac-feeinvoices",
  "ac-discounts",
  "ac-salary",
  "ac-past-fee",
  "ac-fee-history",
  // Inventory
  "inv-items",
  // Transport
  "tr-dashboard",
  "tr-buses",
  "tr-drivers",
  "tr-conductors",
  "tr-routes",
  "tr-bus-routes",
  "tr-staff-assign",
  "tr-students",
];

export const ASSIGNABLE_SECTION_SET = new Set(ASSIGNABLE_SECTION_IDS);

/** Roles that can have section access managed (not Admin/Principal/SuperAdmin) */
export const CONTROLLABLE_STAFF_ROLES = [
  "Teacher",
  "Accountant",
  "Staff",
  "Librarian",
];

/** Roles that always see full menu and manage Control Panel */
export const UNRESTRICTED_ROLES = ["SuperAdmin", "Admin", "Principal"];
