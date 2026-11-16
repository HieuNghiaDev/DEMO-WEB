import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import OfficeSwitcher from "../components/employee-room/OfficeSwitcher";
import NotificationBell from "../components/employee-room/NotificationBell";
import { getEmployeeAvatarImageUrl } from "../utils/employeeAvatar";
import { Button, ModalShell, UserAvatar } from "../components/ui";
import { ButtonSpinner } from "../components/loading";
import InternalChatPanel from "../features/internal-chat/InternalChatPanel";
import {
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
  Sun,
  ChevronUp,
  Maximize2,
} from "lucide-react";

type WorkStatus = "working" | "break" | "outside" | "offline";
const attendanceStatusActions = [
  { status: "working", icon: Briefcase, tone: "var(--tm-success)" },
  { status: "break", icon: Coffee, tone: "var(--tm-warning)" },
  { status: "outside", icon: MapPin, tone: "var(--tm-info)" },
  { status: "offline", icon: Power, tone: "var(--tm-danger)" },
] as const;

type OfficeId = "themis" | "law";
type TaskModalMode = "start" | "change";
type TaskDurationPreset = 30 | 60 | 120 | "custom";

function AttendanceDialog({ titleId, busy, onClose, children, bottomSheet = false, className = "" }: {
  titleId: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  bottomSheet?: boolean;
  className?: string;
}) {
  return (
    <ModalShell isOpen customContent title={null} onClose={onClose} dismissible={!busy}
      overlayClassName={`workspace-modal-backdrop flex justify-center bg-slate-950/50 backdrop-blur-[2px] ${bottomSheet ? "items-end sm:items-center sm:p-4" : "items-center p-4"}`}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}
        className={`themis-app workspace-modal-panel max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-[var(--tm-shadow-lg)] ${className}`}>
        {children}
      </div>
    </ModalShell>
  );
}

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

type AttendancePeriod = {
  id: number;
  attendance_id: number;
  type: "break" | "outside";
  started_at: string;
  expected_end_at: string | null;
  ended_at: string | null;
  destination: string | null;
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
  periods: AttendancePeriod[];
  employee: {
    id: number;
    employee_code: string;
    full_name: string;
    full_name_kana: string | null;
    gender: string | null;
    avatar_path: string | null;
    position_title: string | null;
    employment_type: string | null;
    office_id: number | null;
    office: {
      office_code: string;
    } | null;
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
  work_session_id: number | null;
  title: string;
  description: string | null;
  duration_minutes: number;
  due_at: string | null;
  status: AssignedTaskStatus;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
  work_session?: WorkSession | null;
};

type AssignedTasksResponse = {
  tasks: AssignedTask[];
};

type AssignedTaskResponse = {
  message: string;
  task: AssignedTask;
};

type NotificationKind = "success" | "info" | "warning" | "error";

type OsakaWeather = {
  temperature: number | null;
  label: string;
};

type UserNotification = {
  id: string;
  sourceKey: string;
  title: string;
  message: string;
  kind: NotificationKind;
  createdAt: string;
  isRead: boolean;
  serverId?: number;
  assignedTaskId?: number;
  approvalId?: number;
  targetPath?: string;
};

type NewNotification = Pick<
  UserNotification,
  "sourceKey" | "title" | "message" | "kind" | "assignedTaskId"
>;

const loadStoredNotifications = (storageKey: string): UserNotification[] => {
  if (!storageKey) return [];

  try {
    const storedNotifications = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "[]",
    ) as UserNotification[];

    return Array.isArray(storedNotifications) ? storedNotifications : [];
  } catch {
    return [];
  }
};

type OfficeMapPosition = { left: string; top: string };

const officeMapPositions: Record<WorkStatus, OfficeMapPosition[]> = {
  working: [
    { left: "14%", top: "29%" },
    { left: "30%", top: "29%" },
    { left: "14%", top: "49%" },
    { left: "30%", top: "49%" },
    { left: "14%", top: "68%" },
    { left: "30%", top: "68%" },
  ],
  break: [
    { left: "51%", top: "55%" },
    { left: "63%", top: "55%" },
    { left: "51%", top: "70%" },
    { left: "63%", top: "70%" },
  ],
  outside: [
    { left: "78%", top: "39%" },
    { left: "89%", top: "39%" },
    { left: "78%", top: "58%" },
    { left: "89%", top: "58%" },
  ],
  offline: [],
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

  return <section role="dialog" aria-labelledby="employee-profile-title" onClick={(event) => event.stopPropagation()} style={position} className={`absolute z-40 w-72 -translate-y-1/2 rounded-xl border border-white/80 bg-white/95 p-4 shadow-xl shadow-slate-950/25 max-sm:!inset-x-2 max-sm:!bottom-2 max-sm:!top-auto max-sm:!w-auto max-sm:!translate-x-0 max-sm:!translate-y-0 ${opensLeft ? '-translate-x-[calc(100%+2.5rem)]' : 'translate-x-10'} dark:border-slate-600 dark:bg-slate-900/95`}>
    <span className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-white/80 bg-white/95 max-sm:hidden dark:border-slate-600 dark:bg-slate-900/95 ${opensLeft ? '-right-1.5 rotate-[225deg]' : '-left-1.5'}`} />
    <div className="relative flex items-start gap-3">
      <UserAvatar
        name={employeeName}
        stableKey={attendance.employee?.id ?? employeeName}
        imageSrc={getEmployeeAvatarImageUrl(attendance.employee?.avatar_path)}
        imageAlt={`${employeeName}のプロフィール画像`}
        size="md"
        status={attendance.status}
      />
      <div className="min-w-0 flex-1"><p className="text-[9px] font-bold tracking-wider text-indigo-500">EMPLOYEE PROFILE</p><h2 id="employee-profile-title" className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">{employeeName}</h2><p className="truncate text-[10px] text-slate-400">{attendance.employee?.full_name_kana || attendance.employee?.employee_code || "社員情報"}</p></div>
      <button type="button" onClick={onClose} aria-label="プロフィールを閉じる" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15} /></button>
    </div>
    <div className="mt-3 rounded-xl bg-indigo-50/80 p-3 dark:bg-indigo-500/10"><p className="text-[9px] font-bold tracking-wider text-indigo-500">CURRENT TASK</p><p className="mt-1 text-xs font-bold leading-relaxed text-slate-800 dark:text-slate-100">{attendance.active_work_session?.task_description || "現在登録されている作業はありません"}</p></div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-400">雇用形態</p><p className="mt-0.5 truncate font-semibold text-slate-700 dark:text-slate-200">{formatEmploymentType(attendance.employee?.employment_type)}</p></div><div><p className="text-slate-400">勤務開始</p><p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{formatWorkTime(attendance.clock_in)}</p></div><div><p className="text-slate-400">状態</p><p className="mt-0.5 inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200"><span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />{statusLabel}</p></div></div>
    {attendance.status === "outside" && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700"><p className="text-[10px] font-semibold text-blue-600 dark:text-blue-300"><MapPin className="mr-1 inline" size={12} />{attendance.outside_destination || "外出先未登録"}</p><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-slate-400">外出開始</p><p className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{formatWorkTime(attendance.outside_start ?? "")}</p></div><div><p className="text-slate-400">帰社予定</p><p className="mt-0.5 font-semibold text-blue-600 dark:text-blue-300">{formatWorkTime(attendance.outside_expected_end ?? "")}</p></div><div><p className="text-slate-400">外出時間</p><p className="mt-0.5 font-mono font-bold text-blue-700 dark:text-blue-200">{attendance.outside_start ? formatElapsedTime(attendance.outside_start, now) : "--:--:--"}</p></div></div></div>}
  </section>;
}

const BASE_URL = import.meta.env.BASE_URL

const formatEmploymentType = (type?: string | null) => {
  const labels: Record<string, string> = {
    full_time: "正社員",
    part_time: "アルバイト",
    contract: "契約社員",
    intern: "インターン",
  };

  return (type && labels[type]) || "雇用形態未登録";
};

const getOfficeMapPositions = (attendances: Attendance[]) => {
  const positionByAttendanceId = new Map<number, OfficeMapPosition>();

  (Object.keys(officeMapPositions) as WorkStatus[]).forEach((status) => {
    const positions = officeMapPositions[status];
    if (positions.length === 0) return;

    attendances
      .filter((attendance) => attendance.status === status)
      .sort((left, right) => {
        const leftKey = left.employee?.employee_code ?? String(left.id);
        const rightKey = right.employee?.employee_code ?? String(right.id);
        return leftKey.localeCompare(rightKey);
      })
      .forEach((attendance, index) => {
        positionByAttendanceId.set(attendance.id, positions[index % positions.length]);
      });
  });

  return positionByAttendanceId;
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

const officeCodeToRoom: Record<string, OfficeId> = {
  THEMIS: "themis",
  CHUKA_LAW: "law",
};

const resolveOfficeRoom = (officeCode?: string | null): OfficeId =>
  officeCode ? (officeCodeToRoom[officeCode] ?? "themis") : "themis";


const formatJapaneseDate = () => {
  const now = new Date();
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(now);
};

const formatJapaneseTime = () => {
  const now = new Date();
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(now);
};

const weatherLabelByCode: Record<number, string> = {
  0: "晴れ",
  1: "ほぼ晴れ",
  2: "晴れ時々くもり",
  3: "くもり",
  45: "霧",
  48: "霧",
  51: "小雨",
  53: "小雨",
  55: "強い小雨",
  61: "雨",
  63: "雨",
  65: "強い雨",
  71: "雪",
  73: "雪",
  75: "強い雪",
  80: "にわか雨",
  81: "にわか雨",
  82: "強いにわか雨",
  95: "雷雨",
};

const defaultOsakaWeather: OsakaWeather = {
  temperature: null,
  label: "天気情報を取得中",
};

export default function EmployeeRoom() {
  const { user } = useAuth();
  const navigate = useNavigate();

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
  const [dateTimeDisplay, setDateTimeDisplay] = useState(() => ({
    date: formatJapaneseDate(),
    time: formatJapaneseTime(),
  }));
  const [osakaWeather, setOsakaWeather] =
    useState<OsakaWeather>(defaultOsakaWeather);
  const [isAttendanceCollapsed, setIsAttendanceCollapsed] = useState(false);
  const [activeAttendances, setActiveAttendances] = useState<Attendance[]>([]);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<
    number | null
  >(null);
  const [selectedOffice, setSelectedOffice] = useState<OfficeId>(() =>
    resolveOfficeRoom(user?.employee?.office?.office_code),
  );
  const [, setNotifications] = useState<UserNotification[]>(() =>
    loadStoredNotifications(notificationStorageKey),
  );
  const [toastNotification, setToastNotification] =
    useState<UserNotification | null>(null);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [taskClock, setTaskClock] = useState(() => Date.now());
  const [updatingAssignedTaskId, setUpdatingAssignedTaskId] = useState<
    number | null
  >(null);
  const [assignedTaskError, setAssignedTaskError] = useState("");
  const knownPendingTaskIdsRef = useRef<Set<number> | null>(null);
  const questAudioContextRef = useRef<AudioContext | null>(null);
  const officeMapRef = useRef<HTMLDivElement | null>(null);
  const [isOfficeMapFullscreen, setIsOfficeMapFullscreen] = useState(false);
  const [officeMapOrientationHint, setOfficeMapOrientationHint] =
    useState(false);

  const statusLabels: Record<WorkStatus, string> = {
    working: "勤務中",
    break: "休憩中",
    outside: "外出中",
    offline: "オフライン",
};

  const selectedOfficeInfo = offices[selectedOffice];
  const myQuestTasks = assignedTasks;
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

  const playNewQuestSound = useCallback(() => {
    if (typeof window === "undefined" || !("AudioContext" in window)) {
      return;
    }

    try {
      const audioContext =
        questAudioContextRef.current ?? new AudioContext();
      questAudioContextRef.current = audioContext;
      void audioContext.resume();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startAt = audioContext.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(740, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(1046, startAt + 0.18);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.45);
    } catch {
      // Trình duyệt có thể chặn âm thanh trước thao tác đầu tiên của người dùng.
    }
  }, []);

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

  const handleNotificationClick = (notification: UserNotification) => {
    markNotificationAsRead(notification.id);
    if (notification.targetPath) navigate(notification.targetPath);
  };

  useEffect(() => {
    const loadId = window.setTimeout(() => {
      setNotifications(loadStoredNotifications(notificationStorageKey));
    }, 0);
    return () => window.clearTimeout(loadId);
  }, [notificationStorageKey]);

  // Nhân viên chỉ xuất hiện trong đúng phòng thuộc văn phòng của họ.
  // Các bản ghi cũ thiếu office_code vẫn tạm đặt ở THEMIS để không biến mất.
  const visibleAttendances = activeAttendances.filter((attendance) => {
    const officeCode = attendance.employee?.office?.office_code;
    const employeeOffice = officeCode ? officeCodeToRoom[officeCode] : "themis";

    return employeeOffice === selectedOffice;
  });
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
    }, 15000);

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
    const pendingTasks = assignedTasks.filter((task) => task.status === "pending");
    const pendingTaskIds = new Set(pendingTasks.map((task) => task.id));
    const knownTaskIds = knownPendingTaskIdsRef.current;

    if (knownTaskIds === null) {
      knownPendingTaskIdsRef.current = pendingTaskIds;
      pendingTasks.forEach((task) => {
        pushNotification({
          sourceKey: `assigned-task-${task.id}`,
          title: "新しい業務が届きました",
          message: task.title,
          kind: "info",
          assignedTaskId: task.id,
        });
      });
      return;
    }

    const newTasks = pendingTasks.filter((task) => !knownTaskIds.has(task.id));
    knownPendingTaskIdsRef.current = pendingTaskIds;

    newTasks.forEach((task) => {
      pushNotification({
        sourceKey: `assigned-task-${task.id}`,
        title: "新しい業務が届きました",
        message: task.title,
        kind: "info",
        assignedTaskId: task.id,
      });
      playNewQuestSound();
    });
  }, [assignedTasks, playNewQuestSound, pushNotification]);

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
    const clockId = window.setInterval(() => {
      setDateTimeDisplay({ date: formatJapaneseDate(), time: formatJapaneseTime() });
    }, 30_000);
    return () => window.clearInterval(clockId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadOsakaWeather = async () => {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=34.6937&longitude=135.5023&current=temperature_2m,weather_code&timezone=Asia%2FTokyo",
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Weather request failed");

        const payload = (await response.json()) as {
          current?: { temperature_2m?: number; weather_code?: number };
        };
        const temperature = payload.current?.temperature_2m;
        const weatherCode = payload.current?.weather_code;

        setOsakaWeather({
          temperature: typeof temperature === "number" ? temperature : null,
          label:
            typeof weatherCode === "number"
              ? (weatherLabelByCode[weatherCode] ?? "天気情報")
              : "天気情報",
        });
      } catch {
        if (!controller.signal.aborted) {
          setOsakaWeather({ temperature: null, label: "天気情報を取得できません" });
        }
      }
    };

    void loadOsakaWeather();
    const refreshId = window.setInterval(loadOsakaWeather, 10 * 60 * 1_000);

    return () => {
      controller.abort();
      window.clearInterval(refreshId);
    };
  }, []);

  useEffect(() => {
    const hasOutsideEmployee = activeAttendances.some(
      (attendance) => attendance.status === "outside" && attendance.outside_start,
    );

    if (!hasOutsideEmployee) return;

    const intervalId = window.setInterval(() => setTaskClock(Date.now()), 1_000);

    return () => window.clearInterval(intervalId);
  }, [activeAttendances]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsOfficeMapFullscreen(document.fullscreenElement === officeMapRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      screen.orientation?.unlock?.();
    };
  }, []);

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

      if (status === "in_progress" && updatedTask.work_session) {
        setActiveWorkSession(updatedTask.work_session);
        setActiveAttendances((current) =>
          current.map((attendance) =>
            attendance.id === updatedTask.work_session?.attendance_id
              ? {
                  ...attendance,
                  active_work_session: updatedTask.work_session ?? null,
                }
              : attendance,
          ),
        );
      }

      if (
        status === "completed" &&
        activeWorkSession?.id === updatedTask.work_session_id
      ) {
        setActiveWorkSession(null);
        setActiveAttendances((current) =>
          current.map((attendance) =>
            attendance.id === activeWorkSession.attendance_id
              ? { ...attendance, active_work_session: null }
              : attendance,
          ),
        );
      }


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

    setErrorMessage("");
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
      void loadAssignedTasks();
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

    setErrorMessage("");
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

  const closeAttendanceReport = () => {
    setIsAttendanceReportPromptOpen(false);
    setAttendanceReportError("");
  };

  const officeMapPositionByAttendanceId = getOfficeMapPositions(visibleAttendances);

  const openOfficeMapLandscape = async () => {
    const officeMap = officeMapRef.current;
    if (!officeMap) return;

    setOfficeMapOrientationHint(false);

    try {
      await officeMap.requestFullscreen();
      await screen.orientation?.lock?.("landscape");

      window.setTimeout(() => {
        if (window.matchMedia("(orientation: portrait)").matches) {
          void document.exitFullscreen();
          setOfficeMapOrientationHint(true);
        }
      }, 450);
    } catch {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      if (isPortrait && document.fullscreenElement === officeMap) {
        void document.exitFullscreen();
      }
      setOfficeMapOrientationHint(isPortrait);
    }
  };

  return (
    <div className="overflow-x-clip bg-slate-50 pb-3 dark:bg-[#090B0E]">
      {/* ── Page header ── */}
      <header className="border-b border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-[1680px] px-3 sm:px-4 lg:px-5">
          <div className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:gap-4 sm:py-3.5">
            {/* Title */}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight text-gray-800 dark:text-slate-100 sm:text-2xl">
                合同事務所・社員ルーム
              </h1>
              <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">
                メンバーの勤務・業務状況を確認し、スマートなチーム運営を実現します。
              </p>
            </div>

            {/* Actions */}
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <div className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                <span>
                  {dateTimeDisplay.date}
                  <span className="ml-1 font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {dateTimeDisplay.time}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                  <Sun size={12} className="shrink-0" />
                  <span className="font-semibold">
                    大阪 {osakaWeather.temperature === null ? "--" : Math.round(osakaWeather.temperature)}°C
                  </span>
                  <span className="text-amber-500/70">{osakaWeather.label}</span>
                </span>
              </div>

              <NotificationBell />

            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-3 pt-3 sm:px-4 lg:px-5">
      {/* 2. Office selector — selection/data handling remains in this page. */}
      <OfficeSwitcher
        offices={Object.values(offices)}
        selectedOfficeId={selectedOffice}
        onSelectOffice={handleOfficeChange}
        summary="2法人・1チーム"
      />


      <div className="grid grid-cols-1 gap-3 sm:gap-3.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)]">
        <div key={`office-scene-${selectedOffice}`} className="workspace-office-scene min-w-0 self-start rounded-tm-panel border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3.5 sm:p-4 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 flex items-center justify-between">
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
            ref={officeMapRef}
            className={`relative w-full overflow-visible bg-slate-950 shadow-inner ${
              isOfficeMapFullscreen
                ? "h-[100dvh] max-h-[100dvh] rounded-none border-0"
                : "aspect-[16/9] min-h-[220px] rounded-lg border border-slate-200 dark:border-slate-700 sm:min-h-0"
            }`}
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
              className={`absolute inset-0 h-full w-full object-cover brightness-[0.82] contrast-[1.06] saturate-[0.9] ${
                isOfficeMapFullscreen ? "" : "rounded-lg"
              }`}
            />

            <div className={`pointer-events-none absolute inset-0 bg-slate-950/10 ${isOfficeMapFullscreen ? "" : "rounded-lg"}`} />

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void openOfficeMapLandscape();
              }}
              className="absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-slate-950/80 px-2 py-1.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm sm:hidden"
              aria-label="オフィスマップを横向きの全画面で表示"
            >
              <Maximize2 size={13} />
              横向きで表示
            </button>

            {officeMapOrientationHint && (
              <div className="absolute inset-x-3 bottom-3 z-20 rounded-md border border-white/15 bg-slate-950/85 px-3 py-2 text-center text-[11px] font-medium text-white shadow-sm backdrop-blur-sm sm:hidden">
                端末を横向きにしてから、もう一度お試しください。
              </div>
            )}

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
              const position = officeMapPositionByAttendanceId.get(attendance.id);
              const isSelected = selectedAttendanceId === attendance.id;

              if (!position) return null;

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
                  title={`${vietnameseName} — ${statusLabels[attendance.status]}`}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 transition duration-150 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                    isSelected ? "z-30" : "z-10"
                  }`}
                >
                  <UserAvatar
                    name={vietnameseName}
                    stableKey={attendance.employee?.id ?? vietnameseName}
                    imageSrc={getEmployeeAvatarImageUrl(attendance.employee?.avatar_path)}
                    imageAlt={`${vietnameseName}のプロフィール画像`}
                    size="md"
                    status={attendance.status}
                  />

                  <span className={`absolute left-1/2 top-full mt-1 max-w-28 -translate-x-1/2 truncate rounded-md border border-white/10 bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm transition-opacity sm:text-[10px] ${
                    isSelected ? "opacity-100" : "pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  }`}>
                    {vietnameseName}
                  </span>
                </button>
              );
            })}
            {selectedAttendance && (
              <EmployeeProfilePopover
                attendance={selectedAttendance}
                statusLabel={statusLabels[selectedAttendance.status]}
                position={officeMapPositionByAttendanceId.get(selectedAttendance.id) ?? { left: "50%", top: "50%" }}
                now={taskClock}
                onClose={() => setSelectedAttendanceId(null)}
              />
            )}
          </div>
        </div>

          <section aria-labelledby="work-attendance-title" className="@container min-w-0 self-start overflow-hidden rounded-tm-panel border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs lg:col-span-2 lg:row-start-2">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-[var(--tm-surface-elevated)]/65 px-3.5 py-2.5 sm:px-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar
                    name={employeeName || "社員"}
                    stableKey={user?.employee?.id ?? employeeName}
                    imageSrc={getEmployeeAvatarImageUrl(user?.employee?.avatar_path)}
                    imageAlt={`${employeeName || "社員"}のプロフィール画像`}
                    size="md"
                    status={isWorkStarted ? workStatus : "offline"}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--tm-primary)]">
                        <Briefcase size={12} aria-hidden="true" />
                        ATTENDANCE
                      </span>
                      <span className="text-[var(--tm-border)]" aria-hidden="true">·</span>
                      <h3 id="work-attendance-title" className="text-sm font-bold text-[var(--tm-text-primary)]">勤務登録</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          !isWorkStarted
                            ? "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-secondary)]"
                            : workStatus === "working"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : workStatus === "break"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : workStatus === "outside"
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                            : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-secondary)]"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            !isWorkStarted
                              ? "bg-slate-400"
                              : workStatus === "working"
                              ? "bg-emerald-500"
                              : workStatus === "break"
                              ? "bg-amber-500"
                              : workStatus === "outside"
                              ? "bg-sky-500"
                              : "bg-slate-400"
                          }`}
                          aria-hidden="true"
                        />
                        {isWorkStarted ? statusLabels[workStatus] : "未出勤"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--tm-text-secondary)]">
                      <span className="font-semibold text-[var(--tm-text-primary)]">
                        {employeeName || "社員情報を取得できません"}
                      </span>
                      {user?.employee?.employee_code && (
                        <span className="font-mono text-[11px] text-[var(--tm-text-muted)]">
                          {user.employee.employee_code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isWorkStarted && (
                  <div className="flex flex-wrap items-center gap-2 border-l border-[var(--tm-border)] pl-4 max-md:hidden">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2.5 py-1 text-xs text-[var(--tm-text-secondary)]">
                      <Clock3 size={13} className="text-[var(--tm-primary)]" aria-hidden="true" />
                      <span>出勤</span>
                      <strong className="font-mono font-semibold text-[var(--tm-text-primary)]">
                        {ownActiveAttendance?.clock_in ? formatWorkTime(ownActiveAttendance.clock_in) : "--:--"}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2.5 py-1 text-xs text-[var(--tm-text-secondary)]">
                      <MapPin size={13} className="text-[var(--tm-primary)]" aria-hidden="true" />
                      <span className="font-medium text-[var(--tm-text-primary)]">{selectedOfficeInfo.name}</span>
                    </span>
                    <span
                      className={`inline-flex max-w-xs items-center gap-1.5 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2.5 py-1 text-xs text-[var(--tm-text-secondary)] transition-all duration-250 ease-out motion-reduce:transition-none ${
                        isAttendanceCollapsed ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0 hidden"
                      }`}
                    >
                      <ListTodo size={13} className="shrink-0 text-[var(--tm-primary)]" aria-hidden="true" />
                      <span className="truncate font-medium text-[var(--tm-text-primary)]">
                        {activeWorkSession?.task_description ?? "作業未登録"}
                      </span>
                      {activeWorkSession && (
                        <span className="shrink-0 font-mono text-[11px] text-[var(--tm-text-muted)]">
                          {formatWorkTime(activeWorkSession.started_at)}～{formatWorkTime(activeWorkSession.expected_end_at)}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isWorkStarted && (
                  <Button type="button" variant="primary" onClick={handleStartRequest} disabled={!employeeName || isSubmitting}
                    icon={<Play size={15} aria-hidden="true" />} className="min-h-9">
                    勤務開始
                  </Button>
                )}
                {isWorkStarted && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={!isAttendanceCollapsed}
                    aria-controls="work-attendance-panel-body"
                    onClick={() => setIsAttendanceCollapsed((prev) => !prev)}
                    icon={
                      <ChevronUp
                        size={15}
                        aria-hidden="true"
                        className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                          isAttendanceCollapsed ? "rotate-180" : "rotate-0"
                        }`}
                      />
                    }
                    className="min-h-9 bg-[var(--tm-surface)]"
                  >
                    {isAttendanceCollapsed ? "展開" : "折りたたむ"}
                  </Button>
                )}
              </div>
            </header>

            {errorMessage && (
              <div className="px-4 pt-3 sm:px-5">
                <p role="alert" className="rounded-lg border border-[var(--tm-danger)] px-3 py-2 text-sm text-[var(--tm-danger)]">
                  {errorMessage}
                </p>
              </div>
            )}

            {isWorkStarted && (
              <div
                id="work-attendance-panel-body"
                aria-hidden={isAttendanceCollapsed}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  isAttendanceCollapsed ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="grid grid-cols-1 gap-3 border-t border-[var(--tm-border)] p-3 sm:px-4 sm:py-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:items-stretch">
                    <div className="flex min-w-0 flex-col justify-between rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/45 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold tracking-wide text-[var(--tm-text-secondary)]">
                          勤務ステータス切替
                        </span>
                        <span className="text-[11px] text-[var(--tm-text-muted)]">
                          現在: <strong className="font-semibold text-[var(--tm-text-primary)]">{statusLabels[workStatus]}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 @min-[460px]:grid-cols-4" role="group" aria-label="勤務ステータス">
                        {attendanceStatusActions.map(({ status, icon: Icon, tone }) => (
                          <Button key={status} type="button" variant="outline" aria-pressed={workStatus === status}
                            style={{ "--attendance-tone": tone } as CSSProperties}
                            className={`min-h-10 min-w-0 bg-[var(--tm-surface)] aria-pressed:border-[var(--attendance-tone)] aria-pressed:bg-[color-mix(in_srgb,var(--attendance-tone)_12%,var(--tm-surface))] aria-pressed:font-semibold aria-pressed:shadow-2xs ${status === "offline" ? "text-red-700! dark:text-red-300!" : ""}`}
                            icon={<Icon size={15} aria-hidden="true" />} disabled={isSubmitting} onClick={() => handleStatusRequest(status)}>
                            {statusLabels[status]}
                          </Button>
                        ))}
                      </div>

                      {workStatus === "outside" && (
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2">
                          <p className="min-w-0 text-xs leading-5 text-[var(--tm-text-secondary)]">
                            現在時刻を帰社時刻として記録します。
                            {ownActiveAttendance?.outside_expected_end && (
                              <span className="ml-2 font-semibold text-[var(--tm-text-primary)]">帰社予定 {formatWorkTime(ownActiveAttendance.outside_expected_end)}</span>
                            )}
                          </p>
                          <Button type="button" variant="outline" size="sm" onClick={() => handleStatusRequest("working")} disabled={isSubmitting}
                            icon={<CheckCircle2 size={15} aria-hidden="true" />} className="min-h-8 bg-[var(--tm-surface)]">
                            外出を終了・帰社
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-col justify-between rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/45 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--tm-text-secondary)]">
                          <ListTodo size={13} className="text-[var(--tm-primary)]" aria-hidden="true" />
                          {activeWorkSession ? "進行中の作業" : "現在の作業"}
                        </span>
                        {activeWorkSession ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--tm-primary)]/25 bg-[var(--tm-primary-muted)] px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[var(--tm-primary)]">
                            <Timer size={11} aria-hidden="true" />
                            {formatWorkTime(activeWorkSession.started_at)} ～ {formatWorkTime(activeWorkSession.expected_end_at)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--tm-text-muted)]">
                            <span className="size-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                            状態: <strong className="font-semibold text-[var(--tm-text-secondary)]">未登録</strong>
                          </span>
                        )}
                      </div>

                      <div
                        className={`flex min-h-10 flex-wrap items-center justify-between gap-2.5 rounded-lg border px-3 py-1 transition-colors ${
                          activeWorkSession
                            ? "border-[var(--tm-primary)]/30 bg-[color-mix(in_srgb,var(--tm-primary)_8%,var(--tm-surface))]"
                            : "border-dashed border-[var(--tm-border)] bg-[var(--tm-surface)]"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className={`size-2 shrink-0 rounded-full ${
                              activeWorkSession ? "bg-[var(--tm-primary)]" : "bg-slate-300 dark:bg-slate-600"
                            }`}
                            aria-hidden="true"
                          />
                          <p
                            className={`truncate text-xs sm:text-sm ${
                              activeWorkSession
                                ? "font-semibold text-[var(--tm-text-primary)]"
                                : "text-[var(--tm-text-secondary)]"
                            }`}
                          >
                            {activeWorkSession?.task_description ?? "現在登録されている作業はありません"}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={activeWorkSession ? "outline" : "primary"}
                            onClick={() => openTaskModal(activeWorkSession ? "change" : "start")}
                            disabled={isSubmitting}
                            icon={<PencilLine size={14} aria-hidden="true" />}
                            className={`min-h-8 ${activeWorkSession ? "bg-[var(--tm-surface)]" : ""}`}
                          >
                            {activeWorkSession ? "作業を変更" : "作業を登録"}
                          </Button>
                          {activeWorkSession && (
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              onClick={handleCompleteTask}
                              disabled={isSubmitting}
                              icon={<CheckCircle2 size={14} aria-hidden="true" />}
                              className="min-h-8"
                            >
                              完了
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

        {/* Right Column */}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:contents">
          <div className="min-w-0 lg:relative lg:col-start-2 lg:row-start-1 lg:min-h-[410px] lg:[&>.internal-chat-panel]:absolute lg:[&>.internal-chat-panel]:inset-0 lg:[&>.internal-chat-panel]:h-full!">
            <InternalChatPanel variant="embedded" />
          </div>

          {/* Retained for future notification entry; hidden only in Employee Room. */}
          <div hidden className="hidden relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className={`absolute left-0 right-0 top-0 h-1 ${myQuestTasks.length ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-700"}`} />

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
              <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-[10px] font-semibold text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                確認待ちの業務が{pendingAssignedTaskCount}件あります。通知から内容を確認してください。
              </div>
            )}

            {assignedTaskError && (
              <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {assignedTaskError}
              </div>
            )}

            {myQuestTasks.length > 0 ? (
              <div className="space-y-3">
                {myQuestTasks.map((task) => {
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
        </div>
      </div>

      {/* In-app notification toast */}
      {toastNotification && createPortal(
        <div
          className="quest-notification-toast flex items-start gap-2.5 rounded-xl border p-3"
          data-kind={toastNotification.kind}
        >
          <span
            className="quest-notification-toast-icon flex size-8 shrink-0 items-center justify-center rounded-lg"
            aria-hidden="true"
          >
            {toastNotification.assignedTaskId ? (
              <Briefcase size={20} />
            ) : toastNotification.kind === "success" ? (
              <CheckCircle2 size={20} />
            ) : toastNotification.kind === "warning" ||
              toastNotification.kind === "error" ? (
              <AlertTriangle size={20} />
            ) : (
              <Info size={20} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div role={toastNotification.kind === "error" ? "alert" : "status"} className="[overflow-wrap:anywhere]">
              <p className="text-sm font-semibold">{toastNotification.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-tm-text-secondary">{toastNotification.message}</p>
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
              <span className="text-[11px] text-tm-text-secondary">
                {formatNotificationTime(toastNotification.createdAt)}
              </span>
              <button
                type="button"
                onClick={() => {
                  handleNotificationClick(toastNotification);
                  setToastNotification(null);
                }}
                className="min-h-8 rounded-md px-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
              >
                {toastNotification.targetPath ? "確認する" : "既読にする"}
              </button>
            </div>

            {toastNotification.assignedTaskId &&
              (() => {
                const task = assignedTasks.find(
                  (item) => item.id === toastNotification.assignedTaskId,
                );
                const isUpdating = updatingAssignedTaskId === task?.id;

                if (!task || task.status !== "pending") return null;

                return (
                  <button
                    type="button"
                    disabled={updatingAssignedTaskId !== null}
                    onClick={() => void handleAcceptAssignedTask(task)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-500/25 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} />
                    {isUpdating ? "確認中..." : "業務を確認して受け取る"}
                  </button>
                );
              })()}
          </div>

          <button
            type="button"
            aria-label="通知を閉じる"
            onClick={() => setToastNotification(null)}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-tm-text-secondary transition hover:bg-[var(--tm-surface-hover)] hover:text-tm-text-primary"
          >
            <X size={16} />
          </button>
        </div>,
        document.body,
      )}

      {/* Attendance Start Confirmation Modal */}
      {isStartConfirmationOpen && (
        <AttendanceDialog titleId="attendance-start-confirmation-title" busy={isSubmitting}
          onClose={() => setIsStartConfirmationOpen(false)} className="max-w-sm rounded-xl p-6">
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

            {errorMessage && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{errorMessage}</p>}
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
                {isSubmitting ? <ButtonSpinner size={16} /> : <Play size={16} />}
                {isSubmitting ? "処理中…" : "勤務を開始"}
              </button>
            </div>
        </AttendanceDialog>
      )}

      {/* Personal Attendance Report Prompt */}
      {isAttendanceReportPromptOpen && (
        <AttendanceDialog titleId="attendance-report-prompt-title" busy={isDownloadingAttendanceReport}
          onClose={closeAttendanceReport} bottomSheet className="max-w-md rounded-t-xl pb-[env(safe-area-inset-bottom)] sm:rounded-xl">
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
                <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-[var(--tm-danger)]">
                  {attendanceReportError}
                </p>
              )}

              <div className="mt-5 grid grid-cols-[0.85fr_1.15fr] gap-3">
                <button
                  type="button"
                  onClick={closeAttendanceReport}
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
                  {isDownloadingAttendanceReport ? <ButtonSpinner size={17} /> : <Download size={17} />}
                  {isDownloadingAttendanceReport
                    ? "作成中…"
                    : "Excelを保存"}
                </button>
              </div>
            </div>
        </AttendanceDialog>
      )}

      {/* Work Session Modal */}
      {taskModalMode && (
        <AttendanceDialog titleId="work-session-modal-title" busy={isSubmitting}
          onClose={() => setTaskModalMode(null)} className="max-w-md rounded-xl p-5 sm:p-6">
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

            {errorMessage && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{errorMessage}</p>}
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
                {isSubmitting ? <ButtonSpinner size={16} /> : <Play size={16} />}
                {isSubmitting
                  ? "処理中…"
                  : taskModalMode === "start"
                    ? "作業を開始"
                    : "次の作業を開始"}
              </button>
            </div>
        </AttendanceDialog>
      )}

      {/* Status Confirmation Modal */}
      {pendingStatus && (
        <AttendanceDialog titleId="status-confirmation-title" busy={isSubmitting}
          onClose={() => setPendingStatus(null)} className={`rounded-xl p-6 ${pendingStatus === "outside" ? "max-w-md" : "max-w-sm"}`}>
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
                  「{pendingStatus ? statusLabels[pendingStatus] : ""}」
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

            {errorMessage && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{errorMessage}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingStatus(null)}
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
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition ${
                  pendingStatus === "offline"
                    ? "bg-red-500 shadow-red-500/20 hover:bg-red-600"
                    : pendingStatus === "outside"
                      ? "bg-blue-600 shadow-blue-500/20 hover:bg-blue-700"
                      : "bg-[#635BFF] shadow-indigo-500/20 hover:bg-indigo-600"
                }`}
              >
                {isSubmitting && <ButtonSpinner size={16} />}
                {isSubmitting ? "処理中…" : "変更する"}
              </button>
            </div>
        </AttendanceDialog>
      )}
      </main>
    </div>
  );
}
