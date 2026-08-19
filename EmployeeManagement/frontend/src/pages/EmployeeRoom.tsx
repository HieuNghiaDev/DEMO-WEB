import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import {
  Sparkles,
  Plus,
  Bell,
  Play,
  Briefcase,
  Coffee,
  Power,
  CircleHelp,
  MapPin,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  Info,
  ListTodo,
  PencilLine,
  Timer,
  Download,
  FileSpreadsheet,
  X,
} from "lucide-react";

type WorkStatus = "working" | "break" | "outside" | "offline";
type OfficeId = "themis" | "law";
type TaskModalMode = "start" | "change";
type TaskDurationPreset = 30 | 60 | 120 | "custom";

type Office = {
  id: OfficeId;
  name: string;
  shortName: string;
  address: string;
  logo: string;
  image: string;
  accent: string;
};

type WorkSession = {
  id: number;
  attendance_id: number;
  task_description: string;
  started_at: string;
  expected_end_at: string;
  ended_at: string | null;
  status: "active" | "completed";
};

type Attendance = {
  id: number;
  employee_name: string;
  work_date: string;
  clock_in: string;
  break_start: string | null;
  break_end: string | null;
  outside_destination: string | null;
  outside_start: string | null;
  outside_expected_end: string | null;
  outside_end: string | null;
  clock_out: string | null;
  status: WorkStatus;
  active_work_session: WorkSession | null;
  employee: {
    id: number;
    employee_code: string;
    full_name: string;
    full_name_kana: string | null;
    gender: string | null;
    avatar_path: string | null;
    position_title: string | null;
    employment_type: string | null;
  } | null;
};

type AttendanceResponse = {
  message: string;
  attendance: Attendance;
};

type ActiveAttendancesResponse = {
  count: number;
  attendances: Attendance[];
};

type WorkSessionResponse = {
  message: string;
  work_session: WorkSession;
};

type AssignedTaskStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected";

type AssignedTask = {
  id: number;
  employee_id: number;
  title: string;
  description: string | null;
  duration_minutes: number;
  due_at: string | null;
  status: AssignedTaskStatus;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type AssignedTasksResponse = {
  tasks: AssignedTask[];
};

type AssignedTaskResponse = {
  message: string;
  task: AssignedTask;
};

type NotificationKind = "success" | "info" | "warning" | "error";

type UserNotification = {
  id: string;
  sourceKey: string;
  title: string;
  message: string;
  kind: NotificationKind;
  createdAt: string;
  isRead: boolean;
};

type NewNotification = Pick<
  UserNotification,
  "sourceKey" | "title" | "message" | "kind"
>;

const femaleDeskPositions = [
  { left: "15%", top: "30%" },
  { left: "30%", top: "30%" },
];

const maleDeskPositions = [
  { left: "15%", top: "50%" },
  { left: "30%", top: "50%" },
];

const breakPositions = [
  { left: "51%", top: "56%" },
  { left: "62%", top: "56%" },
  { left: "51%", top: "70%" },
  { left: "62%", top: "70%" },
];

const outsidePositions = [
  { left: "79%", top: "40%" },
  { left: "88%", top: "40%" },
  { left: "79%", top: "57%" },
  { left: "88%", top: "57%" },
];

const employeeDeskSlots: Record<string, number> = {
  TM001: 0,
  TM002: 1,
  TM003: 0,
  TM004: 1,
};

const employeeBreakSlots: Record<string, number> = {
  TM001: 0,
  TM002: 1,
  TM003: 2,
  TM004: 3,
};

const employeeOutsideSlots: Record<string, number> = {
  TM001: 0,
  TM002: 1,
  TM003: 2,
  TM004: 3,
};

const formatWorkTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));

const formatElapsedTime = (startValue: string, now: number) => {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startValue).getTime()) / 1_000));
  const hours = Math.floor(elapsedSeconds / 3_600);
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
  const seconds = elapsedSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const getJapanTimeInput = (minutesFromNow = 0) => {
  const date = new Date(Date.now() + minutesFromNow * 60_000);

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(date);
};

const formatNotificationTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));

const formatExpectedTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));

const getAssignedTaskCountdown = (task: AssignedTask, now: number) => {
  if (!task.accepted_at) return null;

  const endsAt = task.due_at
    ? new Date(task.due_at).getTime()
    : new Date(task.accepted_at).getTime() + task.duration_minutes * 60_000;
  const difference = endsAt - now;
  const absoluteSeconds = Math.floor(Math.abs(difference) / 1_000);
  const hours = Math.floor(absoluteSeconds / 3_600);
  const minutes = Math.floor((absoluteSeconds % 3_600) / 60);
  const seconds = absoluteSeconds % 60;
  const formatted = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

  return {
    isOvertime: difference < 0,
    formatted,
    remainingPercent: Math.max(
      0,
      Math.min(
        100,
        (difference /
          Math.max(
            1,
            endsAt - new Date(task.accepted_at).getTime(),
          )) *
          100,
      ),
    ),
  };
};

const getDownloadFilename = (contentDisposition?: string) => {
  const encodedMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1].replace(/["']/g, ""));
  }

  const plainMatch = contentDisposition?.match(/filename="?([^";]+)"?/i);

  return plainMatch?.[1] ?? `attendance-${new Date().toISOString().slice(0, 10)}.xlsx`;
};

const getOutsideReturnTiming = (
  expectedValue: string,
  actualValue: string,
) => {
  const expectedTime = new Date(expectedValue).getTime();
  const actualTime = new Date(actualValue).getTime();
  const differenceMinutes = Math.round((actualTime - expectedTime) / 60_000);

  if (differenceMinutes === 0) {
    return {
      label: "予定どおりに帰社",
      className: "bg-emerald-50 text-emerald-600",
    };
  }

  if (differenceMinutes < 0) {
    return {
      label: `予定より${Math.abs(differenceMinutes)}分早く帰社`,
      className: "bg-sky-50 text-sky-600",
    };
  }

  return {
    label: `予定より${differenceMinutes}分遅く帰社`,
    className: "bg-amber-50 text-amber-700",
  };
};

type JapaneseTimePart = "hour" | "minute";

const timeHours = Array.from({ length: 24 }, (_, index) => index);
const timeMinutes = Array.from({ length: 60 }, (_, index) => index);

const getJapaneseTimeParts = (value: string) => {
  const [rawHour = "0", rawMinute = "0"] = value.split(":");
  return {
    hour: Number(rawHour),
    minute: Number(rawMinute),
  };
};

const updateJapaneseTime = (
  value: string,
  part: JapaneseTimePart,
  nextValue: string,
) => {
  const current = getJapaneseTimeParts(value || "00:00");
  const hour = part === "hour" ? Number(nextValue) : current.hour;
  const minute = part === "minute" ? Number(nextValue) : current.minute;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

type JapaneseTimePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function JapaneseTimePicker({
  label,
  value,
  onChange,
}: JapaneseTimePickerProps) {
  const time = getJapaneseTimeParts(value || "00:00");
  const selectClassName =
    "h-11 min-w-0 rounded-xl border border-blue-200 bg-white px-2 text-center text-sm font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  const handleChange = (part: JapaneseTimePart, nextValue: string) => {
    onChange(updateJapaneseTime(value, part, nextValue));
  };

  return (
    <fieldset>
      <legend className="text-xs font-semibold text-gray-600">{label}</legend>

      <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <select
          aria-label={`${label} 時`}
          value={time.hour}
          onChange={(event) => handleChange("hour", event.target.value)}
          className={selectClassName}
        >
          {timeHours.map((hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}
            </option>
          ))}
        </select>

        <span className="text-sm font-bold text-gray-400">:</span>

        <select
          aria-label={`${label} 分`}
          value={time.minute}
          onChange={(event) => handleChange("minute", event.target.value)}
          className={selectClassName}
        >
          {timeMinutes.map((minute) => (
            <option key={minute} value={minute}>
              {String(minute).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

function EmployeeProfilePopover({
  attendance,
  statusLabel,
  onClose,
  position,
  now,
}: {
  attendance: Attendance;
  statusLabel: string;
  onClose: () => void;
  position: { left: string; top: string };
  now: number;
}) {
  const employeeName =
    attendance.employee?.full_name?.trim() || attendance.employee_name;
  const statusColor =
    attendance.status === "break"
      ? "bg-amber-400"
      : attendance.status === "outside"
        ? "bg-blue-500"
        : "bg-emerald-500";

  const opensLeft = Number.parseFloat(position.left) > 58;

  return <section role="dialog" aria-labelledby="employee-profile-title" onClick={(event) => event.stopPropagation()} style={position} className={`absolute z-40 w-72 -translate-y-1/2 rounded-2xl border border-white/80 bg-white/95 p-4 shadow-xl shadow-slate-950/25 ${opensLeft ? '-translate-x-[calc(100%+2.5rem)]' : 'translate-x-10'} dark:border-slate-600 dark:bg-slate-900/95`}>
    <span className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-white/80 bg-white/95 dark:border-slate-600 dark:bg-slate-900/95 ${opensLeft ? '-right-1.5 rotate-[225deg]' : '-left-1.5'}`} />
    <div className="relative flex items-start gap-3">
      <img src={getEmployeeAvatar(attendance)} alt={employeeName} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-indigo-100 dark:ring-indigo-500/30" />
      <div className="min-w-0 flex-1"><p className="text-[9px] font-bold tracking-wider text-indigo-500">EMPLOYEE PROFILE</p><h2 id="employee-profile-title" className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">{employeeName}</h2><p className="truncate text-[10px] text-slate-400">{attendance.employee?.full_name_kana || attendance.employee?.employee_code || "社員情報"}</p></div>
      <button type="button" onClick={onClose} aria-label="プロフィールを閉じる" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15} /></button>
    </div>
    <div className="mt-3 rounded-xl bg-indigo-50/80 p-3 dark:bg-indigo-500/10"><p className="text-[9px] font-bold tracking-wider text-indigo-500">CURRENT TASK</p><p className="mt-1 text-xs font-bold leading-relaxed text-slate-800 dark:text-slate-100">{attendance.active_work_session?.task_description || "現在登録されている作業はありません"}</p></div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-400">雇用形態</p><p className="mt-0.5 truncate font-semibold text-slate-700 dark:text-slate-200">{formatEmploymentType(attendance.employee?.employment_type)}</p></div><div><p className="text-slate-400">勤務開始</p><p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{formatWorkTime(attendance.clock_in)}</p></div><div><p className="text-slate-400">状態</p><p className="mt-0.5 inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200"><span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />{statusLabel}</p></div></div>
    {attendance.status === "outside" && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700"><p className="text-[10px] font-semibold text-blue-600 dark:text-blue-300"><MapPin className="mr-1 inline" size={12} />{attendance.outside_destination || "外出先未登録"}</p><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-400">外出開始</p><p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{formatWorkTime(attendance.outside_start ?? "")}</p></div><div><p className="text-slate-400">帰社予定</p><p className="mt-0.5 font-semibold text-blue-600 dark:text-blue-300">{formatWorkTime(attendance.outside_expected_end ?? "")}</p></div><div><p className="text-slate-400">外出時間</p><p className="mt-0.5 font-mono font-bold text-blue-700 dark:text-blue-200">{attendance.outside_start ? formatElapsedTime(attendance.outside_start, now) : "--:--:--"}</p></div></div></div>}
  </section>;
}

const BASE_URL = import.meta.env.BASE_URL

const getEmployeeAvatar = (attendance: Attendance) => {
  const fallbackAvatar =
    attendance.employee?.gender === "female"
      ? "/images/girl.png"
      : "/images/boy.png";
  const avatarPath = attendance.employee?.avatar_path || fallbackAvatar;

  return `${BASE_URL}${avatarPath.replace(/^\/+/, "")}`;
};

const formatEmploymentType = (type?: string | null) => {
  const labels: Record<string, string> = {
    full_time: "正社員",
    part_time: "アルバイト",
    contract: "契約社員",
    intern: "インターン",
  };

  return (type && labels[type]) || "雇用形態未登録";
};

const getEmployeePosition = (attendance: Attendance) => {
  const employeeCode = attendance.employee?.employee_code;

  if (attendance.status === "break") {
    const fallbackBreakSlot =
      (attendance.employee?.id ?? attendance.id) % breakPositions.length;
    const breakSlot = employeeCode
      ? employeeBreakSlots[employeeCode] ?? fallbackBreakSlot
      : fallbackBreakSlot;

    return breakPositions[breakSlot];
  }

  if (attendance.status === "outside") {
    const fallbackOutsideSlot =
      (attendance.employee?.id ?? attendance.id) % outsidePositions.length;
    const outsideSlot = employeeCode
      ? employeeOutsideSlots[employeeCode] ?? fallbackOutsideSlot
      : fallbackOutsideSlot;

    return outsidePositions[outsideSlot];
  }

  const isFemale = attendance.employee?.gender === "female";
  const positions = isFemale ? femaleDeskPositions : maleDeskPositions;
  const fallbackSlot = (attendance.employee?.id ?? attendance.id) % 2;
  const slot = employeeCode
    ? employeeDeskSlots[employeeCode] ?? fallbackSlot
    : fallbackSlot;

  return positions[slot];
};

const offices: Record<OfficeId, Office> = {
  themis: {
    id: "themis",
    name: "THEMIS株式会社",
    shortName: "THEMIS OFFICE",
    address: "大阪府松原市北新町2-5-13",
    logo: "T",
    image: `${BASE_URL}images/room.png`,
    accent: "indigo",
  },

  law: {
    id: "law",
    name: "中華総合法律事務所",
    shortName: "LAW OFFICE",
    address: "大阪府松原市天美東1-80-22",
    logo: "法",
    image: `${BASE_URL}images/room.png`,
    accent: "blue",
  },
}

export default function EmployeeRoom() {
  const { user } = useAuth();

  const employeeName =
    user?.employee?.full_name?.trim() ||
    user?.name?.trim() ||
    user?.login_id ||
    "";
  const notificationStorageKey = user
    ? `themis_notifications_${user.id}`
    : "";

  const [isWorkStarted, setIsWorkStarted] = useState(false);
  const [workStatus, setWorkStatus] = useState<WorkStatus>("working");
  const [isStartConfirmationOpen, setIsStartConfirmationOpen] =
    useState(false);
  const [isAttendanceReportPromptOpen, setIsAttendanceReportPromptOpen] =
    useState(false);
  const [isDownloadingAttendanceReport, setIsDownloadingAttendanceReport] =
    useState(false);
  const [attendanceReportError, setAttendanceReportError] = useState("");
  const [pendingStatus, setPendingStatus] = useState<WorkStatus | null>(null);
  const [taskModalMode, setTaskModalMode] =
    useState<TaskModalMode | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStartTime, setTaskStartTime] = useState("");
  const [taskExpectedEndTime, setTaskExpectedEndTime] = useState("");
  const [taskDurationPreset, setTaskDurationPreset] =
    useState<TaskDurationPreset>(60);
  const [activeWorkSession, setActiveWorkSession] =
    useState<WorkSession | null>(null);
  const [outsideStartTime, setOutsideStartTime] = useState("");
  const [outsideExpectedEndTime, setOutsideExpectedEndTime] = useState("");
  const [outsideDestination, setOutsideDestination] = useState("");

  const [attendanceId, setAttendanceId] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [activeAttendances, setActiveAttendances] = useState<Attendance[]>([]);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<
    number | null
  >(null);
  const [selectedOffice, setSelectedOffice] = useState<OfficeId>("themis");
  const [notifications, setNotifications] = useState<UserNotification[]>(
    () => {
      if (!notificationStorageKey) return [];

      try {
        const storedNotifications = JSON.parse(
          window.localStorage.getItem(notificationStorageKey) ?? "[]",
        ) as UserNotification[];

        return Array.isArray(storedNotifications) ? storedNotifications : [];
      } catch {
        return [];
      }
    },
  );
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] =
    useState(false);
  const [toastNotification, setToastNotification] =
    useState<UserNotification | null>(null);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [taskClock, setTaskClock] = useState(() => Date.now());
  const [updatingAssignedTaskId, setUpdatingAssignedTaskId] = useState<
    number | null
  >(null);
  const [assignedTaskError, setAssignedTaskError] = useState("");

  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length;

  const statusLabels: Record<WorkStatus, string> = {
    working: "勤務中",
    break: "休憩中",
    outside: "外出中",
    offline: "オフライン",
  };

  const selectedOfficeInfo = offices[selectedOffice];
  const pendingAssignedTaskCount = assignedTasks.filter(
    (task) => task.status === "pending",
  ).length;

  const saveNotifications = useCallback(
    (nextNotifications: UserNotification[]) => {
      if (!notificationStorageKey) return;

      window.localStorage.setItem(
        notificationStorageKey,
        JSON.stringify(nextNotifications),
      );
    },
    [notificationStorageKey],
  );

  const pushNotification = useCallback(
    (newNotification: NewNotification) => {
      if (!notificationStorageKey) return;

      setNotifications((current) => {
        if (
          current.some(
            (notification) =>
              notification.sourceKey === newNotification.sourceKey,
          )
        ) {
          return current;
        }

        const notification: UserNotification = {
          ...newNotification,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          isRead: false,
        };
        const nextNotifications = [notification, ...current].slice(0, 50);

        saveNotifications(nextNotifications);
        setToastNotification(notification);

        return nextNotifications;
      });
    },
    [notificationStorageKey, saveNotifications],
  );

  const markNotificationAsRead = (notificationId: string) => {
    setNotifications((current) => {
      const nextNotifications = current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification,
      );

      saveNotifications(nextNotifications);
      return nextNotifications;
    });
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((current) => {
      const nextNotifications = current.map((notification) => ({
        ...notification,
        isRead: true,
      }));

      saveNotifications(nextNotifications);
      return nextNotifications;
    });
  };

  // Chưa có company_id nên dữ liệu chấm công hiện tại tạm thuộc THEMIS.
  const visibleAttendances =
    selectedOffice === "themis" ? activeAttendances : [];
  const selectedAttendance = visibleAttendances.find(
    (attendance) => attendance.id === selectedAttendanceId,
  );
  const ownActiveAttendance = activeAttendances.find(
    (attendance) => attendance.employee?.id === user?.employee?.id,
  );
  const handleOfficeChange = (officeId: OfficeId) => {
    setSelectedOffice(officeId);
    setSelectedAttendanceId(null);
  };

  const loadActiveAttendances = useCallback(async () => {
    try {
      const response = await api.get<ActiveAttendancesResponse>(
        "/attendances/active",
      );

      setActiveAttendances(response.data.attendances);
    } catch {
      // Giữ nguyên giao diện nếu việc làm mới bản đồ tạm thời thất bại.
    }
  }, []);

  const loadAssignedTasks = useCallback(async () => {
    try {
      const response = await api.get<AssignedTasksResponse>("/my/tasks");
      setAssignedTasks(Array.isArray(response.data.tasks) ? response.data.tasks : []);
    } catch {
      // Endpoint giao việc có thể chưa được bật ở backend; không làm hỏng EmployeeRoom.
    }
  }, []);

  useEffect(() => {
    if (!user || !notificationStorageKey) return;

    const rawLoginNotification = window.sessionStorage.getItem(
      "themis_login_notification",
    );

    if (!rawLoginNotification) return;

    window.sessionStorage.removeItem("themis_login_notification");

    try {
      const loginNotification = JSON.parse(rawLoginNotification) as {
        createdAt?: string;
      };
      const createdAt = loginNotification.createdAt ?? new Date().toISOString();

      window.setTimeout(() => {
        pushNotification({
          sourceKey: `login-${createdAt}`,
          title: "ログインしました",
          message: `${employeeName}さん、おかえりなさい。`,
          kind: "success",
        });
      }, 0);
    } catch {
      // Dữ liệu đánh dấu đăng nhập không hợp lệ thì chỉ bỏ qua thông báo.
    }
  }, [employeeName, notificationStorageKey, pushNotification, user]);

  useEffect(() => {
    if (!toastNotification) return;

    const timeoutId = window.setTimeout(() => {
      setToastNotification(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [toastNotification]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadActiveAttendances();
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadActiveAttendances();
    }, 10000);

    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadActiveAttendances]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadAssignedTasks();
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadAssignedTasks();
    }, 10000);

    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadAssignedTasks]);

  useEffect(() => {
    assignedTasks
      .filter((task) => task.status === "pending")
      .forEach((task) => {
        pushNotification({
          sourceKey: `assigned-task-${task.id}`,
          title: "新しい業務が届きました",
          message: task.title,
          kind: "info",
        });
      });
  }, [assignedTasks, pushNotification]);

  useEffect(() => {
    const hasActiveTimer = assignedTasks.some(
      (task) =>
        (task.status === "accepted" || task.status === "in_progress") &&
        task.accepted_at,
    );

    if (!hasActiveTimer) return;

    const intervalId = window.setInterval(() => setTaskClock(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [assignedTasks]);

  useEffect(() => {
    const hasOutsideEmployee = activeAttendances.some(
      (attendance) => attendance.status === "outside" && attendance.outside_start,
    );

    if (!hasOutsideEmployee) return;

    const intervalId = window.setInterval(() => setTaskClock(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [activeAttendances]);

  // Khôi phục trạng thái chấm công của người đang đăng nhập sau khi tải lại trang.
  useEffect(() => {
    if (!employeeName) return;

    const ownAttendance = activeAttendances.find(
      (attendance) =>
        attendance.employee_name === employeeName &&
        attendance.clock_out === null,
    );

    if (!ownAttendance) return;

    const restoreId = window.setTimeout(() => {
      setAttendanceId(ownAttendance.id);
      setWorkStatus(ownAttendance.status);
      setIsWorkStarted(true);
      setActiveWorkSession(ownAttendance.active_work_session ?? null);
    }, 0);

    return () => {
      window.clearTimeout(restoreId);
    };
  }, [activeAttendances, employeeName]);

  useEffect(() => {
    const checkOutsideDeadline = () => {
      const ownAttendance = activeAttendances.find(
        (attendance) =>
          attendance.employee_name === employeeName &&
          attendance.status === "outside" &&
          attendance.outside_expected_end,
      );

      if (!ownAttendance?.outside_expected_end) return;

      const expectedEnd = new Date(ownAttendance.outside_expected_end);
      const remainingMinutes = Math.ceil(
        (expectedEnd.getTime() - Date.now()) / 60_000,
      );
      const expectedTimeLabel = formatExpectedTime(
        ownAttendance.outside_expected_end,
      );
      const reminderKey = `${ownAttendance.id}-${ownAttendance.outside_expected_end}`;

      if (remainingMinutes <= 0) {
        pushNotification({
          sourceKey: `outside-overdue-${reminderKey}`,
          title: "帰社予定時刻を過ぎています",
          message: `帰社予定は${expectedTimeLabel}でした。状況を確認してください。`,
          kind: "error",
        });
      } else if (remainingMinutes <= 10) {
        pushNotification({
          sourceKey: `outside-10-${reminderKey}`,
          title: "帰社予定まであと10分",
          message: `${expectedTimeLabel}までに社外業務を完了する予定です。`,
          kind: "warning",
        });
      } else if (remainingMinutes <= 30) {
        pushNotification({
          sourceKey: `outside-30-${reminderKey}`,
          title: "帰社予定まであと30分",
          message: `${expectedTimeLabel}までに社外業務を完了する予定です。`,
          kind: "info",
        });
      }
    };

    checkOutsideDeadline();
    const intervalId = window.setInterval(checkOutsideDeadline, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeAttendances, employeeName, pushNotification]);

  const handleAcceptAssignedTask = async (task: AssignedTask) => {
    if (task.status !== "pending" || updatingAssignedTaskId !== null) return;

    try {
      setUpdatingAssignedTaskId(task.id);
      setAssignedTaskError("");

      const response = await api.patch<AssignedTaskResponse>(
        `/tasks/${task.id}/accept`,
      );
      const acceptedTask = response.data.task;

      setAssignedTasks((current) =>
        current.map((item) =>
          item.id === acceptedTask.id ? acceptedTask : item,
        ),
      );

      pushNotification({
        sourceKey: `assigned-task-accepted-${acceptedTask.id}`,
        title: "業務を確認しました",
        message: `${acceptedTask.title}を受け付けました。`,
        kind: "success",
      });
    } catch (error) {
      setAssignedTaskError(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? "業務の確認に失敗しました。"
          : "サーバーとの通信に失敗しました。",
      );
    } finally {
      setUpdatingAssignedTaskId(null);
    }
  };

  const handleAssignedTaskStatusChange = async (
    task: AssignedTask,
    status: "in_progress" | "completed",
  ) => {
    if (updatingAssignedTaskId !== null) return;

    try {
      setUpdatingAssignedTaskId(task.id);
      setAssignedTaskError("");

      const response = await api.patch<AssignedTaskResponse>(
        `/tasks/${task.id}/status`,
        { status },
      );
      const updatedTask = response.data.task;

      setAssignedTasks((current) =>
        status === "completed"
          ? current.filter((item) => item.id !== updatedTask.id)
          : current.map((item) =>
              item.id === updatedTask.id ? updatedTask : item,
            ),
      );

      pushNotification({
        sourceKey: `assigned-task-${status}-${updatedTask.id}`,
        title: status === "completed" ? "業務を完了しました" : "業務を開始しました",
        message:
          status === "completed"
            ? `${updatedTask.title}を完了として記録しました。`
            : `${updatedTask.title}に取り組み始めました。`,
        kind: "success",
      });
    } catch (error) {
      setAssignedTaskError(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? "業務の更新に失敗しました。"
          : "サーバーとの通信に失敗しました。",
      );
      void loadAssignedTasks();
    } finally {
      setUpdatingAssignedTaskId(null);
    }
  };

  const openTaskModal = (mode: TaskModalMode) => {
    const startTime = getJapanTimeInput();

    setTaskDescription("");
    setTaskStartTime(startTime);
    setTaskExpectedEndTime(getJapanTimeInput(60));
    setTaskDurationPreset(60);
    setTaskModalMode(mode);
  };

  const handleTaskDurationChange = (preset: TaskDurationPreset) => {
    setTaskDurationPreset(preset);

    if (preset !== "custom") {
      setTaskExpectedEndTime(getJapanTimeInput(preset));
    }
  };

  const handleStartRequest = () => {
    if (!employeeName || isWorkStarted || isSubmitting) return;

    setErrorMessage("");
    setIsStartConfirmationOpen(true);
  };

  const handleConfirmStartWork = async () => {
    if (!employeeName || isWorkStarted || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await api.post<AttendanceResponse>(
        "/attendances/start",
      );

      const newAttendance = response.data.attendance;

      setAttendanceId(newAttendance.id);
      setWorkStatus(newAttendance.status);
      setIsWorkStarted(true);
      setActiveWorkSession(newAttendance.active_work_session ?? null);
      setIsStartConfirmationOpen(false);
      setSelectedOffice("themis");
      setActiveAttendances((current) => [
        ...current.filter((item) => item.id !== newAttendance.id),
        newAttendance,
      ]);
      pushNotification({
        sourceKey: `attendance-start-${newAttendance.id}`,
        title: "勤務を開始しました",
        message: "出勤時刻を記録しました。続けて現在の作業を登録してください。",
        kind: "success",
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message ?? "勤務開始の登録に失敗しました。",
        );
      } else {
        setErrorMessage("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAttendanceReport = async () => {
    if (isDownloadingAttendanceReport) return;

    try {
      setIsDownloadingAttendanceReport(true);
      setErrorMessage("");

      const response = await api.get<Blob>("/attendances/my-report", {
        responseType: "blob",
      });
      const downloadUrl = window.URL.createObjectURL(response.data);
      const downloadLink = document.createElement("a");

      downloadLink.href = downloadUrl;
      downloadLink.download = getDownloadFilename(
        response.headers["content-disposition"],
      );
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);

      setIsAttendanceReportPromptOpen(false);
      setAttendanceReportError("");
      pushNotification({
        sourceKey: `attendance-report-${Date.now()}`,
        title: "勤怠表をダウンロードしました",
        message: "本人の勤怠記録と作業記録をExcelファイルにまとめました。",
        kind: "success",
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setAttendanceReportError(
          error.response?.data?.message ??
            "勤怠表のダウンロードに失敗しました。",
        );
      } else {
        setAttendanceReportError("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsDownloadingAttendanceReport(false);
    }
  };

  const handleChangeTask = async () => {
    if (
      attendanceId === null ||
      !taskDescription.trim() ||
      isSubmitting
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await api.post<WorkSessionResponse>(
        "/work-sessions",
        {
          attendance_id: attendanceId,
          task_description: taskDescription.trim(),
          expected_end_time: taskExpectedEndTime,
        },
      );
      const workSession = response.data.work_session;

      setActiveWorkSession(workSession);
      setActiveAttendances((current) =>
        current.map((attendance) =>
          attendance.id === attendanceId
            ? { ...attendance, active_work_session: workSession }
            : attendance,
        ),
      );
      setTaskModalMode(null);
      pushNotification({
        sourceKey: `work-session-${workSession.id}`,
        title: "作業を開始しました",
        message: `${workSession.task_description}を${formatWorkTime(workSession.expected_end_at)}までの予定で開始しました。`,
        kind: "info",
      });
    } catch (error) {
      setIsStartConfirmationOpen(false);

      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message ?? "作業の登録に失敗しました。",
        );
      } else {
        setErrorMessage("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!activeWorkSession || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await api.patch<WorkSessionResponse>(
        `/work-sessions/${activeWorkSession.id}/complete`,
      );
      const completedSession = response.data.work_session;

      setActiveWorkSession(null);
      setActiveAttendances((current) =>
        current.map((attendance) =>
          attendance.id === completedSession.attendance_id
            ? { ...attendance, active_work_session: null }
            : attendance,
        ),
      );
      pushNotification({
        sourceKey: `work-session-completed-${completedSession.id}`,
        title: "作業を完了しました",
        message: `${completedSession.task_description}を完了として記録しました。`,
        kind: "success",
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          const staleWorkSessionId = activeWorkSession.id;

          setActiveWorkSession(null);
          setActiveAttendances((current) =>
            current.map((attendance) =>
              attendance.id === activeWorkSession.attendance_id
                ? { ...attendance, active_work_session: null }
                : attendance,
            ),
          );
          setErrorMessage("");
          pushNotification({
            sourceKey: `work-session-missing-${staleWorkSessionId}`,
            title: "作業情報を更新しました",
            message:
              "この作業はすでに削除または完了されていたため、最新の状態に更新しました。",
            kind: "info",
          });
          void loadActiveAttendances();

          return;
        }

        setErrorMessage(
          error.response?.data?.message ?? "作業の完了登録に失敗しました。",
        );
      } else {
        setErrorMessage("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusRequest = (status: WorkStatus) => {
    if (status === "outside") {
      setOutsideDestination("");
      setOutsideStartTime(getJapanTimeInput());
      setOutsideExpectedEndTime(getJapanTimeInput(60));
    }

    setPendingStatus(status);
  };

  const handleConfirmStatus = async () => {
    if (
      !pendingStatus ||
      attendanceId === null ||
      isSubmitting ||
      (pendingStatus === "outside" && !outsideDestination.trim())
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await api.patch<AttendanceResponse>(
        `/attendances/${attendanceId}/status`,
        {
          status: pendingStatus,
          ...(pendingStatus === "outside"
            ? {
                outside_destination: outsideDestination.trim(),
                outside_start: outsideStartTime,
                outside_expected_end: outsideExpectedEndTime,
              }
            : {}),
        },
      );

      const updatedAttendance = response.data.attendance;
      const outsideReturnTiming =
        workStatus === "outside" &&
        updatedAttendance.status !== "outside" &&
        updatedAttendance.outside_expected_end &&
        updatedAttendance.outside_end
          ? getOutsideReturnTiming(
              updatedAttendance.outside_expected_end,
              updatedAttendance.outside_end,
            )
          : null;

      setWorkStatus(updatedAttendance.status);
      setActiveWorkSession(updatedAttendance.active_work_session ?? null);
      setPendingStatus(null);

      setActiveAttendances((current) => {
        if (updatedAttendance.status === "offline") {
          return current.filter((item) => item.id !== updatedAttendance.id);
        }

        const exists = current.some(
          (item) => item.id === updatedAttendance.id,
        );

        if (!exists) {
          return [...current, updatedAttendance];
        }

        return current.map((item) =>
          item.id === updatedAttendance.id ? updatedAttendance : item,
        );
      });

      if (
        updatedAttendance.status === "outside" &&
        updatedAttendance.outside_expected_end
      ) {
        pushNotification({
          sourceKey: `outside-start-${updatedAttendance.id}-${updatedAttendance.outside_expected_end}`,
          title: "外出予定を登録しました",
          message: `${updatedAttendance.outside_destination ?? "外出先未設定"}へ外出します。帰社予定は${formatExpectedTime(updatedAttendance.outside_expected_end)}です。30分前と10分前にお知らせします。`,
          kind: "info",
        });
      } else {
        const statusNotification = {
          working: {
            title: "勤務中に変更しました",
            message: outsideReturnTiming
              ? `実際の帰社時刻は${formatWorkTime(updatedAttendance.outside_end!)}です。${outsideReturnTiming.label}しました。`
              : "社内業務を再開しました。",
            kind: "success" as const,
          },
          break: {
            title: "休憩を開始しました",
            message: "休憩開始時刻を記録しました。",
            kind: "info" as const,
          },
          offline: {
            title: "勤務を終了しました",
            message: "本日の退勤時刻を記録しました。お疲れさまでした。",
            kind: "success" as const,
          },
          outside: null,
        }[updatedAttendance.status];

        if (statusNotification) {
          pushNotification({
            sourceKey: `status-${updatedAttendance.id}-${updatedAttendance.status}-${Date.now()}`,
            ...statusNotification,
          });
        }
      }

      if (pendingStatus === "offline") {
        setIsWorkStarted(false);
        setAttendanceId(null);
        setSelectedAttendanceId(null);
        setAttendanceReportError("");
        setIsAttendanceReportPromptOpen(true);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message ?? "ステータスの変更に失敗しました。",
        );
      } else {
        setErrorMessage("サーバーとの通信に失敗しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelStatus = () => {
    setPendingStatus(null);
  };

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-3 pb-4 pt-20 sm:p-6">
      {/* 1. Header Top Area */}
      <div className="mb-3 flex flex-col justify-between gap-3 sm:mb-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold text-indigo-500 sm:text-xs sm:font-medium">
            THEMIS株式会社 × 中華総合法律事務所
          </div>

          <h1 className="mt-1 text-xl font-bold leading-tight text-gray-800 sm:mt-0 sm:text-2xl">
            合同事務所・社員ルーム
          </h1>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
          <div className="relative z-50">
            <button
              type="button"
              aria-label="通知を表示"
              aria-expanded={isNotificationPanelOpen}
              onClick={() =>
                setIsNotificationPanelOpen((current) => !current)
              }
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition hover:bg-gray-50 ${
                isNotificationPanelOpen
                  ? "text-indigo-600 ring-2 ring-indigo-100"
                  : "text-gray-600"
              }`}
            >
              <Bell size={20} />

              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#f5f6fa]">
                  {unreadNotificationCount > 99
                    ? "99+"
                    : unreadNotificationCount}
                </span>
              )}
            </button>

            {isNotificationPanelOpen && (
              <div className="fixed inset-x-3 top-20 z-50 w-auto overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl shadow-slate-900/15 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(24rem,calc(100vw-2rem))]">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
                  <div>
                    <h2 className="font-bold text-gray-800">通知</h2>
                    <p className="text-[11px] text-gray-400">
                      {unreadNotificationCount > 0
                        ? `未読 ${unreadNotificationCount}件`
                        : "新しい通知はありません"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {unreadNotificationCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsAsRead}
                        className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50 sm:px-2.5 sm:text-xs"
                      >
                        すべて既読
                      </button>
                    )}

                    <button
                      type="button"
                      aria-label="通知パネルを閉じる"
                      onClick={() => setIsNotificationPanelOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                <div className="max-h-[26rem] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-6 py-10 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                        <Bell size={21} />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-gray-500">
                        通知はまだありません
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        勤怠状況や外出予定をお知らせします
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => markNotificationAsRead(notification.id)}
                        className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left transition last:border-b-0 hover:bg-gray-50 ${
                          notification.isRead ? "bg-white" : "bg-indigo-50/45"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            notification.kind === "success"
                              ? "bg-emerald-100 text-emerald-600"
                              : notification.kind === "warning"
                                ? "bg-amber-100 text-amber-600"
                                : notification.kind === "error"
                                  ? "bg-red-100 text-red-600"
                                  : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {notification.kind === "success" ? (
                            <CheckCircle2 size={18} />
                          ) : notification.kind === "warning" ||
                            notification.kind === "error" ? (
                            <AlertTriangle size={18} />
                          ) : (
                            <Info size={18} />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-gray-800">
                              {notification.title}
                            </span>
                            {!notification.isRead && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                            {notification.message}
                          </span>
                          <span className="mt-1.5 block text-[10px] text-gray-400">
                            {formatNotificationTime(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {isNotificationPanelOpen && (
            <button
              type="button"
              aria-label="通知を閉じる"
              onClick={() => setIsNotificationPanelOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
          )}

          <button className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#635BFF] px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-600 active:scale-[0.98] sm:flex-none sm:px-4">
            <Plus size={18} />
            <span className="truncate">事務所が増築</span>
          </button>
        </div>
      </div>

      {/* 2. Companies Banner Card */}
      <div className="mb-3 flex flex-col justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:mb-4 sm:gap-4 sm:p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            onClick={() => handleOfficeChange("themis")}
            aria-pressed={selectedOffice === "themis"}
            className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition sm:w-auto sm:py-2 ${
              selectedOffice === "themis"
                ? "border-indigo-200 bg-indigo-50 shadow-sm ring-2 ring-indigo-100"
                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
              T
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center justify-between gap-2 text-sm font-bold text-gray-800 sm:justify-start">
                <span className="truncate">THEMIS株式会社</span>

                {selectedOffice === "themis" && (
                  <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white">
                    表示中
                  </span>
                )}
              </div>

              <div className="truncate text-[11px] text-gray-400">
                大阪府松原市北新町2-5-13
              </div>
            </div>
          </button>

          <span className="hidden text-sm font-light text-gray-300 sm:block">
            ×
          </span>

          <button
            type="button"
            onClick={() => handleOfficeChange("law")}
            aria-pressed={selectedOffice === "law"}
            className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition sm:w-auto sm:py-2 ${
              selectedOffice === "law"
                ? "border-blue-200 bg-blue-50 shadow-sm ring-2 ring-blue-100"
                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-900 text-sm font-bold text-white">
              法
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center justify-between gap-2 text-sm font-bold text-gray-800 sm:justify-start">
                <span className="truncate">中華総合法律事務所</span>

                {selectedOffice === "law" && (
                  <span className="shrink-0 rounded-full bg-blue-900 px-2 py-0.5 text-[9px] font-bold text-white">
                    表示中
                  </span>
                )}
              </div>

              <div className="truncate text-[11px] text-gray-400">
                大阪府松原市天美東1-80-22
              </div>
            </div>
          </button>
        </div>

        <span className="w-fit self-end rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600 sm:text-xs lg:self-auto">
          2法人・1チーム
        </span>
      </div>

      {/* 3. Notification Banner */}
      <div className="mb-5 flex flex-col justify-between gap-2.5 rounded-2xl border border-indigo-100/80 bg-indigo-50/70 px-3.5 py-3 text-xs text-indigo-900 sm:mb-6 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-start gap-2 sm:items-center">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-600 sm:mt-0" />

          <span className="leading-relaxed">AIサブマネージャーが改善候補を3件見つけました</span>
        </div>

        <button className="w-fit self-end rounded-lg bg-indigo-100/70 px-3 py-1.5 font-semibold text-indigo-600 transition hover:bg-indigo-100 sm:self-auto sm:bg-transparent sm:px-0 sm:py-0 sm:hover:bg-transparent sm:hover:underline">
          確認する
        </button>
      </div>

      {/* 4. Main Grid Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                {selectedOfficeInfo.shortName}
              </span>

              <h2 className="text-lg font-bold text-gray-800">
                {selectedOfficeInfo.name}の現在
              </h2>

              <p className="mt-0.5 text-[11px] text-gray-400">
                {selectedOfficeInfo.address}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {visibleAttendances.length}名が活動中
            </div>
          </div>

          {/* Map Container */}
          <div
            className="relative aspect-[16/9] min-h-[220px] w-full overflow-visible rounded-xl border border-gray-200 bg-slate-900 sm:min-h-0"
            onClick={() => setSelectedAttendanceId(null)}
          >
            <img
              key={selectedOfficeInfo.id}
              src={selectedOfficeInfo.image}
              alt={`${selectedOfficeInfo.name} Office Top Down View`}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = `${BASE_URL}images/room.png`;
              }}
              className="absolute inset-0 h-full w-full rounded-xl object-cover brightness-90 contrast-105"
            />

            {/* <div
              className={`pointer-events-none absolute left-3 top-3 z-10 rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${
                selectedOfficeInfo.accent === "blue"
                  ? "border-blue-200/70 bg-blue-950/75 text-white"
                  : "border-indigo-200/70 bg-indigo-950/75 text-white"
              }`}
            >
              <div className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                SELECTED OFFICE
              </div>
              <div className="mt-0.5 text-xs font-bold">
                {selectedOfficeInfo.name}
              </div>
            </div> */}

            {visibleAttendances.map((attendance) => {
              const vietnameseName =
                attendance.employee?.full_name?.trim() ||
                attendance.employee_name;
              const position = getEmployeePosition(attendance);
              const isSelected = selectedAttendanceId === attendance.id;

              return (
                <button
                  key={attendance.id}
                  type="button"
                  aria-label={`${vietnameseName}の勤務情報を表示`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAttendanceId(isSelected ? null : attendance.id);
                  }}
                  style={position}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out hover:scale-110 focus:outline-none ${
                    isSelected ? "z-30" : "z-10"
                  }`}
                >
                  <span
                    className={`absolute -right-1 top-0 h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                      attendance.status === "break"
                        ? "bg-amber-400"
                        : attendance.status === "outside"
                          ? "bg-blue-500"
                          : "bg-emerald-500"
                    }`}
                  />

                  <img
                    src={getEmployeeAvatar(attendance)}
                    alt={vietnameseName}
                    className="h-auto w-12 select-none drop-shadow-[0_5px_5px_rgba(15,23,42,0.45)] sm:w-16 lg:w-20"
                    draggable={false}
                  />

                  <span className="absolute left-1/2 top-full mt-1 max-w-24 -translate-x-1/2 truncate rounded-full bg-slate-950/75 px-2 py-0.5 text-[9px] font-semibold text-white sm:text-[10px]">
                    {vietnameseName}
                  </span>
                </button>
              );
            })}
            {selectedAttendance && (
              <EmployeeProfilePopover
                attendance={selectedAttendance}
                statusLabel={statusLabels[selectedAttendance.status]}
                position={getEmployeePosition(selectedAttendance)}
                now={taskClock}
                onClose={() => setSelectedAttendanceId(null)}
              />
            )}
          </div>

          {/* Work Attendance Section */}
          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 sm:p-5">
            {/* Section Header */}
            <div className="mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                WORK ATTENDANCE
              </span>

              <h3 className="mt-1 text-base font-bold text-gray-800">
                勤務登録
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                ログイン中の社員情報で勤務を登録します
              </p>
            </div>

            {/* Logged-in Employee */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                  氏名
                </span>

                <div className="flex h-11 w-full items-center rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 text-sm font-bold text-gray-800">
                  {employeeName || "社員情報を取得できません"}
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartRequest}
                disabled={!employeeName || isWorkStarted || isSubmitting}
                className="flex h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#635BFF] px-5 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
              >
                <Play size={17} />

                {isSubmitting ? "処理中..." : "勤務開始"}
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {errorMessage}
              </div>
            )}

            {/* Status Selection */}
            {isWorkStarted && (
              <div className="mt-5 border-t border-gray-200 pt-5">
                {/* Employee Information */}
                <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <span className="text-xs text-gray-400">勤務者</span>

                    <p className="font-bold text-gray-800">
                      {employeeName}さん
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                      workStatus === "break"
                        ? "bg-amber-50 text-amber-600"
                        : workStatus === "outside"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {statusLabels[workStatus]}
                  </span>
                </div>

                <div className="mb-5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/70 p-4 shadow-sm dark:border-indigo-400/25 dark:from-slate-900 dark:to-indigo-950/80 dark:shadow-indigo-950/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                        <ListTodo size={14} />
                        CURRENT TASK
                      </div>

                      {activeWorkSession ? (
                        <>
                          <p className="mt-2 break-words text-sm font-bold text-gray-800">
                            {activeWorkSession.task_description}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-indigo-100">
                              <Clock3 size={13} className="text-indigo-500" />
                              {formatWorkTime(activeWorkSession.started_at)}
                              <span className="text-gray-300">→</span>
                              {formatWorkTime(
                                activeWorkSession.expected_end_at,
                              )}
                            </span>
                            <span className="rounded-full bg-indigo-100 px-2.5 py-1 font-bold text-indigo-600">
                              進行中
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="mt-2 text-sm font-medium text-gray-400">
                          現在登録されている作業はありません
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openTaskModal(
                            activeWorkSession ? "change" : "start",
                          )
                        }
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-60"
                      >
                        <PencilLine size={14} />
                        {activeWorkSession ? "作業を変更" : "作業を登録"}
                      </button>

                      {activeWorkSession && (
                        <button
                          type="button"
                          onClick={handleCompleteTask}
                          disabled={isSubmitting}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <CheckCircle2 size={14} />
                          完了
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <p className="mb-3 text-xs font-semibold text-gray-600">
                  勤務ステータス
                </p>

                {workStatus === "outside" && (
                  <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-orange-800">外出・出張を終了しますか？</p>
                      <p className="mt-1 text-[11px] text-orange-700">帰社した今の時刻を実際の終了時刻として記録します。予定より早くても遅くても記録できます。</p>
                      {ownActiveAttendance?.outside_expected_end && <p className="mt-1.5 text-[11px] font-semibold text-orange-700">帰社予定: {formatWorkTime(ownActiveAttendance.outside_expected_end)}</p>}
                    </div>
                    <button type="button" onClick={() => handleStatusRequest("working")} disabled={isSubmitting} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-orange-500/25 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"><CheckCircle2 size={15} />外出を終了・帰社</button>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {/* Working */}
                  <button
                    type="button"
                    onClick={() => handleStatusRequest("working")}
                    disabled={isSubmitting}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      workStatus === "working"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-600 ring-2 ring-emerald-100"
                        : "border-gray-200 bg-white text-gray-500 hover:border-emerald-300 hover:bg-emerald-50"
                    }`}
                  >
                    <Briefcase size={17} />
                    勤務中
                  </button>

                  {/* Break */}
                  <button
                    type="button"
                    onClick={() => handleStatusRequest("break")}
                    disabled={isSubmitting}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      workStatus === "break"
                        ? "border-amber-500 bg-amber-50 text-amber-600 ring-2 ring-amber-100"
                        : "border-gray-200 bg-white text-gray-500 hover:border-amber-300 hover:bg-amber-50"
                    }`}
                  >
                    <Coffee size={17} />
                    休憩中
                  </button>

                  {/* Outside */}
                  <button
                    type="button"
                    onClick={() => handleStatusRequest("outside")}
                    disabled={isSubmitting}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      workStatus === "outside"
                        ? "border-blue-500 bg-blue-50 text-blue-600 ring-2 ring-blue-100"
                        : "border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    <MapPin size={17} />
                    外出中
                  </button>

                  {/* Offline */}
                  <button
                    type="button"
                    onClick={() => handleStatusRequest("offline")}
                    disabled={isSubmitting}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      workStatus === "offline"
                        ? "border-red-500 bg-red-50 text-red-600 ring-2 ring-red-100"
                        : "border-red-200 bg-white text-red-500 hover:border-red-400 hover:bg-red-50"
                    }`}
                  >
                    <Power size={17} />
                    オフライン
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          {/* Assigned tasks */}
          <div className="order-2 relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className={`absolute left-0 right-0 top-0 h-1 ${assignedTasks.length ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-700"}`} />

            <div className="mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                  MY QUEST
                </span>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  受け取った業務の内容と残り時間を確認できます
                </p>
              </div>
            </div>

            {pendingAssignedTaskCount > 0 && (
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                確認待ちの業務が{pendingAssignedTaskCount}件あります
              </div>
            )}

            {assignedTaskError && (
              <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {assignedTaskError}
              </div>
            )}

            {assignedTasks.length > 0 ? (
              <div className="space-y-3">
                {assignedTasks.map((task) => {
                  const isUpdating = updatingAssignedTaskId === task.id;
                  const countdown = getAssignedTaskCountdown(task, taskClock);
                  const status = task.status === "pending"
                    ? { label: "未確認", className: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" }
                    : task.status === "accepted"
                      ? { label: "受付済み", className: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" }
                      : { label: "進行中", className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" };

                  return (
                    <article key={task.id} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0 dark:border-slate-700">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold leading-snug text-gray-800 dark:text-white">
                            {task.title}
                          </h4>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-2">
                        <span className="text-[9px] font-bold tracking-wider text-slate-400 dark:text-slate-500">NOTE</span>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{task.description || "業務内容を確認し、期限までに完了してください。"}</p>
                      </div>

                      <div className="mt-4">
                        {countdown ? (
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full transition-[width,background-color] duration-1000 ease-linear" style={{ width: `${countdown.remainingPercent}%`, backgroundColor: countdown.isOvertime ? "#ef4444" : `hsl(${Math.round(countdown.remainingPercent * 2.1)} 86% 48%)` }} /></div>
                        ) : (
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700" />
                        )}
                      </div>

                      {task.status === "pending" && (
                        <button
                          type="button"
                          disabled={updatingAssignedTaskId !== null}
                          onClick={() => void handleAcceptAssignedTask(task)}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          {isUpdating ? "確認中..." : "内容を確認する"}
                        </button>
                      )}

                      {task.status === "accepted" && (
                        <button
                          type="button"
                          disabled={updatingAssignedTaskId !== null}
                          onClick={() => void handleAssignedTaskStatusChange(task, "in_progress")}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Play size={14} />
                          {isUpdating ? "開始中..." : "業務を開始する"}
                        </button>
                      )}

                      {task.status === "in_progress" && (
                        <button
                          type="button"
                          disabled={updatingAssignedTaskId !== null}
                          onClick={() => void handleAssignedTaskStatusChange(task, "completed")}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          {isUpdating ? "完了中..." : "完了にする"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <ListTodo size={20} />
                </div>
                <h4 className="mt-3 text-sm font-bold text-gray-800 dark:text-white">現在、割り当てられた業務はありません</h4>
                <p className="mt-1 text-xs leading-relaxed text-gray-400 dark:text-slate-500">新しい業務が届くと、ここから内容の確認と進捗の更新ができます。</p>
              </>
            )}
          </div>

          {/* AI assistant */}
          <div className="order-1 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-sm">
                AI
              </div>
              <div>
                <span className="block text-[10px] font-medium text-gray-400 dark:text-slate-500">AI社員</span>
                <h3 className="text-base font-bold text-gray-800 dark:text-white">業務改善AI</h3>
                <span className="text-xs text-gray-400 dark:text-slate-500">AIサブマネージャー</span>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-indigo-50 bg-indigo-50/40 p-3.5 dark:border-indigo-500/15 dark:bg-indigo-500/[0.08]">
              <span className="block text-[10px] font-bold tracking-wider text-indigo-500 dark:text-indigo-300">CURRENT WORK</span>
              <p className="mt-1 text-xs font-bold leading-relaxed text-gray-800 dark:text-slate-100">改善候補と不足マニュアルを分析しています</p>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
              <div className="flex justify-between gap-3"><span className="text-slate-400 dark:text-slate-500">所属</span><span className="font-semibold text-slate-700 dark:text-slate-200">共通AI</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400 dark:text-slate-500">状態</span><span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" />観察中</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400 dark:text-slate-500">権限</span><span className="font-semibold text-slate-700 dark:text-slate-200">提案・下書き</span></div>
            </div>
            <button type="button" className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">プロフィールを開く</button>
          </div>
        </div>
      </div>

      {/* In-app notification toast */}
      {toastNotification && (
        <div
          role="status"
          className={`fixed right-4 top-4 z-[120] flex w-[min(23rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border bg-white p-4 shadow-2xl shadow-slate-900/15 ${
            toastNotification.kind === "success"
              ? "border-emerald-100"
              : toastNotification.kind === "warning"
                ? "border-amber-100"
                : toastNotification.kind === "error"
                  ? "border-red-100"
                  : "border-blue-100"
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              toastNotification.kind === "success"
                ? "bg-emerald-100 text-emerald-600"
                : toastNotification.kind === "warning"
                  ? "bg-amber-100 text-amber-600"
                  : toastNotification.kind === "error"
                    ? "bg-red-100 text-red-600"
                    : "bg-blue-100 text-blue-600"
            }`}
          >
            {toastNotification.kind === "success" ? (
              <CheckCircle2 size={20} />
            ) : toastNotification.kind === "warning" ||
              toastNotification.kind === "error" ? (
              <AlertTriangle size={20} />
            ) : (
              <Info size={20} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-800">
              {toastNotification.title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
              {toastNotification.message}
            </p>
          </div>

          <button
            type="button"
            aria-label="通知を閉じる"
            onClick={() => setToastNotification(null)}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Attendance Start Confirmation Modal */}
      {isStartConfirmationOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!isSubmitting) setIsStartConfirmationOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-start-confirmation-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Play size={27} />
            </div>

            <div className="text-center">
              <h3
                id="attendance-start-confirmation-title"
                className="text-lg font-bold text-gray-800"
              >
                勤務開始の確認
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                出勤時刻を記録して、勤務を開始しますか？
              </p>
              <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-left">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                  EMPLOYEE
                </span>
                <span className="mt-1 block break-words text-sm font-bold text-gray-800">
                  {employeeName}
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setIsStartConfirmationOpen(false)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmStartWork}
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#635BFF] px-4 py-3 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play size={16} />
                {isSubmitting ? "処理中..." : "勤務を開始"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personal Attendance Report Prompt */}
      {isAttendanceReportPromptOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => {
            if (!isDownloadingAttendanceReport) {
              setIsAttendanceReportPromptOpen(false);
              setAttendanceReportError("");
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-report-prompt-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-t-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 dark:border-slate-700/80 dark:bg-slate-900 sm:rounded-3xl"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" />

            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-4 text-left">
                <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm ring-4 ring-emerald-50 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/5">
                  <CheckCircle2 size={27} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h3
                    id="attendance-report-prompt-title"
                    className="text-lg font-bold text-slate-900 dark:text-white"
                  >
                    勤務を終了しました
                  </h3>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-300">
                    本日の勤怠表を確認しますか？
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-left dark:border-indigo-400/20 dark:bg-indigo-400/10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-950/70 dark:text-indigo-300">
                  <FileSpreadsheet size={21} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    個人勤怠表（Excel）
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    あなた本人の勤怠記録と作業記録だけを安全に出力します。
                  </p>
                </div>
              </div>

              {attendanceReportError && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
                  {attendanceReportError}
                </p>
              )}

              <div className="mt-5 grid grid-cols-[0.85fr_1.15fr] gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAttendanceReportPromptOpen(false);
                    setAttendanceReportError("");
                  }}
                  disabled={isDownloadingAttendanceReport}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  あとで
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAttendanceReport}
                  disabled={isDownloadingAttendanceReport}
                  className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={17} />
                  {isDownloadingAttendanceReport
                    ? "作成中..."
                    : "Excelを保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Work Session Modal */}
      {taskModalMode && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setTaskModalMode(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-session-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              {taskModalMode === "start" ? (
                <Play size={25} />
              ) : (
                <PencilLine size={24} />
              )}
            </div>

            <div className="text-center">
              <h3
                id="work-session-modal-title"
                className="text-lg font-bold text-gray-800"
              >
                {taskModalMode === "start"
                  ? "最初の作業を登録"
                  : "作業を変更"}
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {taskModalMode === "start"
                  ? "出勤時刻を記録しました。続けて、今から取り組む内容を入力してください。"
                  : "現在の作業を完了し、次の作業を開始します。"}
              </p>
            </div>

            <div className="mt-5 space-y-4 text-left">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-600">
                  作業内容
                </span>
                <span className="relative block">
                  <ListTodo
                    size={17}
                    className="pointer-events-none absolute left-3 top-3 text-indigo-500"
                  />
                  <input
                    type="text"
                    value={taskDescription}
                    onChange={(event) =>
                      setTaskDescription(event.target.value)
                    }
                    maxLength={255}
                    autoFocus
                    placeholder="例：契約書の確認"
                    className="h-11 w-full rounded-xl border border-indigo-200 bg-white pl-10 pr-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  />
                </span>
              </label>

              <div>
                <span className="mb-2 block text-xs font-bold text-gray-600">
                  予定時間
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {([30, 60, 120] as const).map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => handleTaskDurationChange(minutes)}
                      className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                        taskDurationPreset === minutes
                          ? "border-indigo-500 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-100"
                          : "border-gray-200 text-gray-500 hover:border-indigo-200 hover:bg-indigo-50/50"
                      }`}
                    >
                      {minutes < 60 ? `${minutes}分` : `${minutes / 60}時間`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleTaskDurationChange("custom")}
                    className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                      taskDurationPreset === "custom"
                        ? "border-indigo-500 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-100"
                        : "border-gray-200 text-gray-500 hover:border-indigo-200 hover:bg-indigo-50/50"
                    }`}
                  >
                    時刻指定
                  </button>
                </div>
              </div>

              {taskDurationPreset === "custom" && (
                <JapaneseTimePicker
                  label="完了予定時刻"
                  value={taskExpectedEndTime}
                  onChange={setTaskExpectedEndTime}
                />
              )}

              <div className="flex items-center justify-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm font-bold text-gray-700">
                <Timer size={17} className="text-indigo-500" />
                <span>{taskStartTime}</span>
                <span className="text-indigo-300">→</span>
                <span className="text-indigo-600">
                  {taskExpectedEndTime}
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setTaskModalMode(null)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleChangeTask}
                disabled={
                  isSubmitting ||
                  !taskDescription.trim() ||
                  !taskExpectedEndTime
                }
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-2 py-3 text-[13px] font-bold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none sm:gap-2 sm:px-4 sm:text-sm"
              >
                <Play size={16} />
                {isSubmitting
                  ? "処理中..."
                  : taskModalMode === "start"
                    ? "作業を開始"
                    : "次の作業を開始"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Confirmation Modal */}
      {pendingStatus && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={handleCancelStatus}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-confirmation-title"
            onClick={(event) => event.stopPropagation()}
            className={`max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ${
              pendingStatus === "outside" ? "max-w-md" : "max-w-sm"
            }`}
          >
            <div
              className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
                pendingStatus === "offline"
                  ? "bg-red-100 text-red-600"
                  : pendingStatus === "outside"
                    ? "bg-blue-100 text-blue-600"
                    : "bg-indigo-100 text-indigo-600"
              }`}
            >
              <CircleHelp size={28} />
            </div>

            <div className="text-center">
              <h3
                id="status-confirmation-title"
                className="text-lg font-bold text-gray-800"
              >
                ステータス変更の確認
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                勤務ステータスを
                <span
                  className={`mx-1 font-bold ${
                    pendingStatus === "offline"
                      ? "text-red-600"
                      : pendingStatus === "outside"
                        ? "text-blue-600"
                        : "text-indigo-600"
                  }`}
                >
                  「{statusLabels[pendingStatus]}」
                </span>
                に変更しますか？
              </p>
            </div>

            {pendingStatus === "outside" && (
              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-left">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-700">
                  <Clock3 size={17} />
                  外出予定を登録
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-gray-600">
                      外出先・用件
                    </span>
                    <span className="relative block">
                      <MapPin
                        size={17}
                        className="pointer-events-none absolute left-3 top-3 text-blue-500"
                      />
                      <textarea
                        value={outsideDestination}
                        onChange={(event) =>
                          setOutsideDestination(event.target.value)
                        }
                        rows={2}
                        maxLength={255}
                        autoFocus
                        placeholder="例：大阪法務局で書類を提出"
                        className="w-full resize-none rounded-xl border border-blue-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </span>
                    <span className="mt-1 block text-right text-[10px] text-gray-400">
                      {outsideDestination.length}/255
                    </span>
                  </label>

                  <JapaneseTimePicker
                    label="外出時刻"
                    value={outsideStartTime}
                    onChange={setOutsideStartTime}
                  />

                  <JapaneseTimePicker
                    label="完了予定時刻"
                    value={outsideExpectedEndTime}
                    onChange={setOutsideExpectedEndTime}
                  />
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-blue-600">
                  外回り・出張・社外業務の予定時間を登録します。
                </p>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleCancelStatus}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleConfirmStatus}
                disabled={
                  isSubmitting ||
                  (pendingStatus === "outside" &&
                    (!outsideDestination.trim() ||
                      !outsideStartTime ||
                      !outsideExpectedEndTime))
                }
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition ${
                  pendingStatus === "offline"
                    ? "bg-red-500 shadow-red-500/20 hover:bg-red-600"
                    : pendingStatus === "outside"
                      ? "bg-blue-600 shadow-blue-500/20 hover:bg-blue-700"
                      : "bg-[#635BFF] shadow-indigo-500/20 hover:bg-indigo-600"
                }`}
              >
                {isSubmitting ? "処理中..." : "変更する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}