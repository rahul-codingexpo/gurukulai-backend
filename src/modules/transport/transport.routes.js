import express from "express";
import { protect } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { injectSchool } from "../../middleware/injectSchool.middleware.js";
import { uploadTransportPhoto } from "../../middleware/upload.middleware.js";
import {
  listBuses,
  createBus,
  updateBus,
  deactivateBus,
  listDrivers,
  createDriver,
  updateDriver,
  deactivateDriver,
  listConductors,
  createConductor,
  updateConductor,
  deactivateConductor,
  listRoutes,
  createRoute,
  updateRoute,
  updateRouteStops,
  deactivateRoute,
  listBusRouteAssignments,
  createBusRouteAssignment,
  updateBusRouteAssignment,
  listBusStaffAssignments,
  createBusStaffAssignment,
  updateBusStaffAssignment,
  listStudentAssignments,
  createStudentAssignment,
  transferStudentAssignment,
  deactivateStudentAssignment,
  listBusStudents,
  listRouteStudents,
  listUnassignedStudents,
  getTransportDashboard,
} from "./transport.controller.js";

const router = express.Router();

const transportAuth = [
  protect,
  authorize("SuperAdmin", "Admin", "Principal"),
  injectSchool,
];

router.get("/dashboard", ...transportAuth, getTransportDashboard);

router.get("/buses", ...transportAuth, listBuses);
router.post(
  "/buses",
  ...transportAuth,
  uploadTransportPhoto.fields([
    { name: "numberPlatePhoto", maxCount: 1 },
    { name: "additionalPhotos", maxCount: 4 },
  ]),
  createBus,
);
router.put(
  "/buses/:id",
  ...transportAuth,
  uploadTransportPhoto.fields([
    { name: "numberPlatePhoto", maxCount: 1 },
    { name: "additionalPhotos", maxCount: 4 },
  ]),
  updateBus,
);
router.post("/buses/:id/deactivate", ...transportAuth, deactivateBus);
router.get("/buses/:id/students", ...transportAuth, listBusStudents);

router.get("/drivers", ...transportAuth, listDrivers);
router.post("/drivers", ...transportAuth, uploadTransportPhoto.single("photo"), createDriver);
router.put("/drivers/:id", ...transportAuth, uploadTransportPhoto.single("photo"), updateDriver);
router.post("/drivers/:id/deactivate", ...transportAuth, deactivateDriver);

router.get("/conductors", ...transportAuth, listConductors);
router.post("/conductors", ...transportAuth, uploadTransportPhoto.single("photo"), createConductor);
router.put("/conductors/:id", ...transportAuth, uploadTransportPhoto.single("photo"), updateConductor);
router.post("/conductors/:id/deactivate", ...transportAuth, deactivateConductor);

router.get("/routes", ...transportAuth, listRoutes);
router.post("/routes", ...transportAuth, createRoute);
router.put("/routes/:id", ...transportAuth, updateRoute);
router.put("/routes/:id/stops", ...transportAuth, updateRouteStops);
router.post("/routes/:id/deactivate", ...transportAuth, deactivateRoute);
router.get("/routes/:id/students", ...transportAuth, listRouteStudents);

router.get("/bus-route-assignments", ...transportAuth, listBusRouteAssignments);
router.post("/bus-route-assignments", ...transportAuth, createBusRouteAssignment);
router.put("/bus-route-assignments/:id", ...transportAuth, updateBusRouteAssignment);

router.get("/bus-staff-assignments", ...transportAuth, listBusStaffAssignments);
router.post("/bus-staff-assignments", ...transportAuth, createBusStaffAssignment);
router.put("/bus-staff-assignments/:id", ...transportAuth, updateBusStaffAssignment);

router.get("/student-assignments", ...transportAuth, listStudentAssignments);
router.post("/student-assignments", ...transportAuth, createStudentAssignment);
router.post("/student-assignments/:id/transfer", ...transportAuth, transferStudentAssignment);
router.post("/student-assignments/:id/deactivate", ...transportAuth, deactivateStudentAssignment);

router.get("/students/unassigned", ...transportAuth, listUnassignedStudents);

export default router;
