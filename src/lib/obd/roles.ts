import { loadRecords, saveRecords } from "./persist";

export const ROLES = ["Individual Owner", "Technician", "Workshop", "Fleet", "Administrator"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "VIEW",
  "DIAGNOSE",
  "READ_ECU",
  "READ_CALIBRATION",
  "EDIT_CALIBRATION",
  "FLASH_ECU",
  "CLEAR_DTC",
  "EXPORT",
  "MANAGE_VEHICLES",
  "MANAGE_USERS",
  "MANAGE_SETTINGS",
  "SECURITY_DIAGNOSTICS",
  "SAFETY_DIAGNOSTICS",
  "EMISSIONS_DIAGNOSTICS",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Actions that must never run on an implicit grant alone. */
export const HIGH_RISK_PERMISSIONS: Permission[] = [
  "EDIT_CALIBRATION",
  "FLASH_ECU",
  "CLEAR_DTC",
  "MANAGE_USERS",
  "SECURITY_DIAGNOSTICS",
];

const OWNER: Permission[] = ["VIEW", "DIAGNOSE", "EXPORT", "MANAGE_VEHICLES", "EMISSIONS_DIAGNOSTICS"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  "Individual Owner": OWNER,
  Technician: [
    ...OWNER,
    "READ_ECU",
    "READ_CALIBRATION",
    "CLEAR_DTC",
    "SAFETY_DIAGNOSTICS",
    "SECURITY_DIAGNOSTICS",
  ],
  Workshop: [
    ...OWNER,
    "READ_ECU",
    "READ_CALIBRATION",
    "EDIT_CALIBRATION",
    "CLEAR_DTC",
    "SAFETY_DIAGNOSTICS",
    "SECURITY_DIAGNOSTICS",
  ],
  Fleet: [...OWNER, "READ_ECU", "READ_CALIBRATION", "CLEAR_DTC", "SAFETY_DIAGNOSTICS"],
  Administrator: [...PERMISSIONS],
};

export interface Operator {
  role: Role;
  name: string;
  /** Permissions the operator explicitly authorised for this workstation. */
  authorized: Permission[];
}

const KEY = "obd.operator";

export const DEFAULT_OPERATOR: Operator = { role: "Individual Owner", name: "", authorized: [] };

export function loadOperator(): Operator {
  const [record] = loadRecords<Operator>(KEY);
  if (!record || !ROLES.includes(record.role)) return DEFAULT_OPERATOR;
  return {
    role: record.role,
    name: record.name ?? "",
    authorized: (record.authorized ?? []).filter((permission) => PERMISSIONS.includes(permission)),
  };
}

export function saveOperator(operator: Operator) {
  saveRecords(KEY, [operator]);
}

export type PermissionState = "GRANTED" | "AUTHORIZATION REQUIRED" | "NOT PERMITTED FOR THIS ROLE";

export function permissionState(operator: Operator, permission: Permission): PermissionState {
  if (!ROLE_PERMISSIONS[operator.role].includes(permission)) return "NOT PERMITTED FOR THIS ROLE";
  if (HIGH_RISK_PERMISSIONS.includes(permission) && !operator.authorized.includes(permission)) {
    return "AUTHORIZATION REQUIRED";
  }
  return "GRANTED";
}

export function can(operator: Operator, permission: Permission): boolean {
  return permissionState(operator, permission) === "GRANTED";
}
