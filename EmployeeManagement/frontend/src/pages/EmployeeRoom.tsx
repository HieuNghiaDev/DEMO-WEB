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
} from "lucide-react";

type WorkStatus = "working" | "break" | "offline";
type OfficeId = "themis" | "law";

type Office = {
  id: OfficeId;
  name: string;
  shortName: string;
  address: string;
  logo: string;
  image: string;
  accent: string;
};

type Attendance = {
  id: number;
  employee_name: string;
  work_date: string;
  clock_in: string;
  break_start: string | null;
  break_end: string | null;
  clock_out: string | null;
  status: WorkStatus;
  employee: {
    id: number;
    employee_code: string;
    full_name: string;
    full_name_kana: string | null;
    gender: string | null;
    avatar_path: string | null;
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

const femaleDeskPositions = [
  { left: "15%", top: "30%" },
  { left: "30%", top: "30%" },
];

const maleDeskPositions = [
  { left: "15%", top: "50%" },
  { left: "30%", top: "50%" },
];

const breakPositions = [
  { left: "70%", top: "35%" },
  { left: "84%", top: "35%" },
  { left: "68%", top: "63%" },
  { left: "82%", top: "63%" },
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

const formatWorkTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));

const BASE_URL = import.meta.env.BASE_URL

const getEmployeeAvatar = (attendance: Attendance) => {
  const fallbackAvatar =
    attendance.employee?.gender === "female"
      ? "/images/girl.png"
      : "/images/boy.png";
  const avatarPath = attendance.employee?.avatar_path || fallbackAvatar;

  return `${BASE_URL}${avatarPath.replace(/^\/+/, "")}`;
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
    image: `${BASE_URL}images/room1.png`,
    accent: "indigo",
  },

  law: {
    id: "law",
    name: "中華総合法律事務所",
    shortName: "LAW OFFICE",
    address: "大阪府松原市天美東1-80-22",
    logo: "法",
    image: `${BASE_URL}images/room1.png`,
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

  const [isWorkStarted, setIsWorkStarted] = useState(false);
  const [workStatus, setWorkStatus] = useState<WorkStatus>("working");
  const [pendingStatus, setPendingStatus] = useState<WorkStatus | null>(null);

  const [attendanceId, setAttendanceId] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [activeAttendances, setActiveAttendances] = useState<Attendance[]>([]);
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<
    number | null
  >(null);
  const [selectedOffice, setSelectedOffice] = useState<OfficeId>("themis");

  const statusLabels: Record<WorkStatus, string> = {
    working: "勤務中",
    break: "休憩中",
    offline: "オフライン",
  };

  const selectedOfficeInfo = offices[selectedOffice];

  // Chưa có company_id nên dữ liệu chấm công hiện tại tạm thuộc THEMIS.
  const visibleAttendances =
    selectedOffice === "themis" ? activeAttendances : [];

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
    }, 0);

    return () => {
      window.clearTimeout(restoreId);
    };
  }, [activeAttendances, employeeName]);

  const handleStartWork = async () => {
    if (!employeeName || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await api.post<AttendanceResponse>(
        "/attendances/start",
        {
          employee_name: employeeName,
        },
      );

      const newAttendance = response.data.attendance;

      setAttendanceId(newAttendance.id);
      setWorkStatus(newAttendance.status);
      setIsWorkStarted(true);
      setSelectedOffice("themis");
      setActiveAttendances((current) => [
        ...current.filter((item) => item.id !== newAttendance.id),
        newAttendance,
      ]);
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

  const handleStatusRequest = (status: WorkStatus) => {
    setPendingStatus(status);
  };

  const handleConfirmStatus = async () => {
    if (!pendingStatus || attendanceId === null || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const response = await api.patch<AttendanceResponse>(
        `/attendances/${attendanceId}/status`,
        {
          status: pendingStatus,
        },
      );

      const updatedAttendance = response.data.attendance;

      setWorkStatus(updatedAttendance.status);
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

      if (pendingStatus === "offline") {
        setIsWorkStarted(false);
        setAttendanceId(null);
        setSelectedAttendanceId(null);
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
    <div className="min-h-screen bg-[#f5f6fa] p-4 sm:p-6">
      {/* 1. Header Top Area */}
      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="text-xs font-medium text-indigo-500">
            THEMIS株式会社 × 中華総合法律事務所
          </div>

          <h1 className="text-2xl font-bold text-gray-800">
            合同事務所・社員ルーム
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm hover:bg-gray-50">
            <Bell size={20} />

            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
              3
            </span>
          </button>

          <button className="flex items-center gap-2 rounded-xl bg-[#635BFF] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-600">
            <Plus size={18} />
            事務所が増築
          </button>
        </div>
      </div>

      {/* 2. Companies Banner Card */}
      <div className="mb-4 flex flex-col justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => handleOfficeChange("themis")}
            aria-pressed={selectedOffice === "themis"}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
              selectedOffice === "themis"
                ? "border-indigo-200 bg-indigo-50 shadow-sm ring-2 ring-indigo-100"
                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
              T
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                THEMIS株式会社

                {selectedOffice === "themis" && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white">
                    表示中
                  </span>
                )}
              </div>

              <div className="text-[11px] text-gray-400">
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
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
              selectedOffice === "law"
                ? "border-blue-200 bg-blue-50 shadow-sm ring-2 ring-blue-100"
                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-900 text-sm font-bold text-white">
              法
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                中華総合法律事務所

                {selectedOffice === "law" && (
                  <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[9px] font-bold text-white">
                    表示中
                  </span>
                )}
              </div>

              <div className="text-[11px] text-gray-400">
                大阪府松原市天美東1-80-22
              </div>
            </div>
          </button>
        </div>

        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
          2法人・1チーム
        </span>
      </div>

      {/* 3. Notification Banner */}
      <div className="mb-6 flex flex-col justify-between gap-3 rounded-2xl border border-indigo-100/80 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-indigo-600" />

          <span>AIサブマネージャーが改善候補を3件見つけました</span>
        </div>

        <button className="w-fit font-semibold text-indigo-600 hover:underline">
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
            className="relative overflow-hidden rounded-xl border border-gray-200"
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
              className="h-full w-full object-cover brightness-90 contrast-105"
            />

            <div
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
            </div>

            {visibleAttendances.map((attendance) => {
              const vietnameseName =
                attendance.employee?.full_name?.trim() ||
                attendance.employee_name;
              const kanaName = attendance.employee?.full_name_kana?.trim();
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
                  {isSelected && (
                    <div className="absolute bottom-full left-1/2 mb-2 w-52 -translate-x-1/2 rounded-xl border border-gray-100 bg-white p-2.5 text-left shadow-xl sm:w-56">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-bold text-gray-800">
                            {kanaName || vietnameseName}
                          </span>

                          {kanaName && (
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-400">
                              {vietnameseName}
                            </span>
                          )}
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                            attendance.status === "break"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          {statusLabels[attendance.status]}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400">出勤時刻</span>
                        <span className="font-semibold text-gray-700">
                          {formatWorkTime(attendance.clock_in)}
                        </span>
                      </div>

                      <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-gray-100 bg-white" />
                    </div>
                  )}

                  <span
                    className={`absolute -right-1 top-0 h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                      attendance.status === "break"
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                  />

                  <img
                    src={getEmployeeAvatar(attendance)}
                    alt={vietnameseName}
                    className="h-auto w-12 select-none drop-shadow-[0_5px_5px_rgba(15,23,42,0.45)] sm:w-16 lg:w-20"
                    draggable={false}
                  />

                  <span className="absolute left-1/2 top-full mt-1 max-w-24 -translate-x-1/2 truncate rounded-full bg-slate-950/75 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm sm:text-[10px]">
                    {vietnameseName}
                  </span>
                </button>
              );
            })}
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
                onClick={handleStartWork}
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

                  <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                    勤務を開始しました
                  </span>
                </div>

                <p className="mb-3 text-xs font-semibold text-gray-600">
                  勤務ステータス
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <div className="space-y-6">
          {/* AI Assistant Profile */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-sm">
                AI
              </div>

              <div>
                <span className="block text-[10px] font-medium text-gray-400">
                  AI社員
                </span>

                <h3 className="text-base font-bold text-gray-800">
                  業務改善AI
                </h3>

                <span className="text-xs text-gray-400">
                  AIサブマネージャー
                </span>
              </div>
            </div>

            {/* Current Work */}
            <div className="mb-4 rounded-xl border border-indigo-50/80 bg-indigo-50/40 p-3.5">
              <span className="mb-1 block text-[11px] font-medium text-gray-400">
                現在の仕事
              </span>

              <p className="text-xs font-bold leading-relaxed text-gray-800">
                改善候補と不足マニュアルを分析しています
              </p>
            </div>

            {/* Meta Details */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">所属</span>

                <span className="font-semibold text-gray-700">共通AI</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">状態</span>

                <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  視察中
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">権限</span>

                <span className="font-semibold text-gray-700">
                  提案・下書き
                </span>
              </div>
            </div>

            <button className="mt-5 w-full rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50">
              プロフィールを開く
            </button>
          </div>

          {/* Main Quest Status */}
          <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="absolute left-0 right-0 top-0 h-1 bg-amber-400" />

            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                MAIN QUEST
              </span>

              <span className="text-xs font-bold text-amber-500">35%</span>
            </div>

            <h4 className="mb-1 text-sm font-bold text-gray-800">
              最初の業務を仕組みにする
            </h4>

            <p className="mb-4 text-xs leading-relaxed text-gray-400">
              新規相談受付の流れを記録し、マニュアル第1版を完成させます。
            </p>

            <button className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:underline">
              クエストを見る →
            </button>
          </div>
        </div>
      </div>

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
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div
              className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
                pendingStatus === "offline"
                  ? "bg-red-100 text-red-600"
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
                      : "text-indigo-600"
                  }`}
                >
                  「{statusLabels[pendingStatus]}」
                </span>
                に変更しますか？
              </p>
            </div>

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
                disabled={isSubmitting}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition ${
                  pendingStatus === "offline"
                    ? "bg-red-500 shadow-red-500/20 hover:bg-red-600"
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
