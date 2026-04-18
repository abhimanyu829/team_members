import { useState, useEffect, useCallback } from "react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Calendar, Plus, X, Clock, Users, ChevronLeft, ChevronRight,
  Ban, Trash2, MapPin, AlertCircle, CheckCircle2, History
} from "lucide-react";

const canManageMeetings = (role) => role === "super_admin" || role === "hod";

const STATUS_STYLE = {
  scheduled: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-500 border-red-200",
};
const STATUS_LABEL = { scheduled: "Scheduled", cancelled: "Cancelled" };

export default function MeetingsPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [createError, setCreateError] = useState("");
  const [newMeeting, setNewMeeting] = useState({
    title: "", description: "", start_time: "", end_time: "",
    attendee_ids: [], notes: ""
  });

  // Minimum datetime string for inputs — right now, so past dates are locked
  const nowMin = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const fetchData = useCallback(async () => {
    try {
      const [meetingsRes, usersRes] = await Promise.all([
        api.get("/api/meetings"),
        api.get("/api/users"),
      ]);
      setMeetings(meetingsRes.data);
      setAllUsers(usersRes.data.filter((u) => u.user_id !== user?.user_id));
    } catch {}
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Calendar helpers ─────────────────────────────────────────────────────
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const getMeetingsForDate = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return meetings.filter((m) => m.start_time?.startsWith(dateStr));
  };

  const selectedDateMeetings = meetings.filter((m) => {
    const d = selectedDate;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return m.start_time?.startsWith(dateStr);
  });

  const now = new Date();
  const upcomingMeetings = meetings
    .filter((m) => new Date(m.start_time) >= now && m.status !== "cancelled")
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const pastMeetings = meetings
    .filter((m) => new Date(m.end_time) < now || m.status === "cancelled")
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setCreateError("");
    const startDt = new Date(newMeeting.start_time);
    const endDt = new Date(newMeeting.end_time);
    if (startDt < new Date()) {
      setCreateError("Meeting start time cannot be in the past. Please choose a future date.");
      return;
    }
    if (endDt <= startDt) {
      setCreateError("End time must be after start time.");
      return;
    }
    try {
      const { data } = await api.post("/api/meetings", {
        ...newMeeting,
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
      });
      setMeetings((m) => [...m, data]);
      setShowCreate(false);
      setNewMeeting({ title: "", description: "", start_time: "", end_time: "", attendee_ids: [], notes: "" });
    } catch (err) {
      setCreateError(err?.response?.data?.detail || "Failed to create meeting.");
    }
  };


  const handleCancelMeeting = async (id) => {
    if (!window.confirm("Cancel this meeting? Attendees will no longer see it as active.")) return;
    try {
      const { data } = await api.put(`/api/meetings/${id}/cancel`);
      setMeetings((m) => m.map((x) => x.meeting_id === id ? { ...x, status: data.status } : x));
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to cancel meeting.");
    }
  };

  const handleDeleteMeeting = async (id) => {
    if (!window.confirm("Permanently delete this meeting? This cannot be undone.")) return;
    try {
      await api.delete(`/api/meetings/${id}`);
      setMeetings((m) => m.filter((x) => x.meeting_id !== id));
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to delete meeting.");
    }
  };

  const toggleAttendee = (uid) => {
    setNewMeeting((m) => ({
      ...m,
      attendee_ids: m.attendee_ids.includes(uid)
        ? m.attendee_ids.filter((id) => id !== uid)
        : [...m.attendee_ids, uid],
    }));
  };

  const canActOn = (meeting) => {
    if (user?.role === "super_admin") return true;
    if (user?.role === "hod" && meeting.organizer_id === user?.user_id) return true;
    return false;
  };

  // ── Meeting Card ──────────────────────────────────────────────────────────
  const MeetingCard = ({ m, showActions = true }) => {
    const isPast = new Date(m.end_time) < now;
    const isCancelled = m.status === "cancelled";
    return (
      <div className={`p-4 rounded-xl border transition-all ${isCancelled ? "bg-zinc-50 border-zinc-200 opacity-70" : isPast ? "bg-zinc-50 border-zinc-100" : "bg-white border-zinc-200 hover:border-indigo-200 hover:shadow-sm"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className={`text-sm font-semibold truncate ${isCancelled ? "line-through text-zinc-400" : "text-zinc-900"}`}>
                {m.title}
              </p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${isCancelled ? STATUS_STYLE.cancelled : isPast ? "bg-zinc-100 text-zinc-500 border-zinc-200" : STATUS_STYLE.scheduled}`}>
                {isCancelled ? "Cancelled" : isPast ? "Completed" : "Scheduled"}
              </span>
            </div>
            {m.description && (
              <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{m.description}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(m.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                {new Date(m.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                {" → "}
                {new Date(m.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {m.attendee_ids?.length || 0} attendees
              </span>
              {m.organizer_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  by {m.organizer_name}
                </span>
              )}
            </div>
          </div>
          {showActions && canActOn(m) && (
            <div className="flex gap-1 flex-shrink-0">
              {!isCancelled && !isPast && (
                <button
                  title="Suspend / Cancel meeting"
                  onClick={() => handleCancelMeeting(m.meeting_id)}
                  className="p-1.5 rounded-lg hover:bg-amber-50 text-zinc-400 hover:text-amber-600 transition-colors"
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              )}
              {user?.role === "super_admin" && (
                <button
                  title="Delete meeting permanently"
                  onClick={() => handleDeleteMeeting(m.meeting_id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>Meetings</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{meetings.length} total · {upcomingMeetings.length} upcoming · {pastMeetings.length} past</p>
        </div>
        {canManageMeetings(user?.role) && (
          <button
            data-testid="create-meeting-button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" /> New Meeting
          </button>
        )}
      </div>

      {/* Worker notice */}
      {user?.role === "worker" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          You are viewing meetings you have been invited to. Only Super Admins and Department Heads can schedule meetings.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              {monthNames[month]} {year}
            </h3>
            <div className="flex gap-1">
              <button data-testid="prev-month-button" onClick={() => setCurrentMonth(new Date(year, month - 1))}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <ChevronLeft className="w-4 h-4 text-zinc-600" />
              </button>
              <button data-testid="next-month-button" onClick={() => setCurrentMonth(new Date(year, month + 1))}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-zinc-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const dayMeetings = getMeetingsForDate(day);
              const activeDayMeetings = dayMeetings.filter((m) => m.status !== "cancelled");
              const isToday = now.getDate() === day && now.getMonth() === month && now.getFullYear() === year;
              const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
              return (
                <button key={day} data-testid={`calendar-day-${day}`}
                  onClick={() => setSelectedDate(new Date(year, month, day))}
                  className={`relative h-10 rounded-lg text-sm font-medium transition-all flex flex-col items-center justify-center ${
                    isSelected ? "bg-indigo-600 text-white" :
                    isToday ? "bg-indigo-50 text-indigo-700 border border-indigo-200" :
                    "hover:bg-zinc-50 text-zinc-700"
                  }`}>
                  {day}
                  {activeDayMeetings.length > 0 && (
                    <div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-white" : "bg-indigo-500"}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected date detail */}
          {selectedDateMeetings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-100">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <div className="space-y-2">
                {selectedDateMeetings.map((m) => <MeetingCard key={m.meeting_id} m={m} />)}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Upcoming */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                Upcoming ({upcomingMeetings.length})
              </h3>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {upcomingMeetings.length === 0 ? (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">No upcoming meetings</p>
                </div>
              ) : (
                upcomingMeetings.map((m) => (
                  <div key={m.meeting_id} data-testid={`meeting-card-${m.meeting_id}`}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-zinc-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                    <div className="flex-shrink-0 w-9 h-9 bg-indigo-600 rounded-lg flex flex-col items-center justify-center text-white">
                      <span className="text-[8px] font-semibold">{new Date(m.start_time).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
                      <span className="text-sm font-bold leading-tight">{new Date(m.start_time).getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 truncate">{m.title}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(m.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Past Meetings */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                Past / Cancelled ({pastMeetings.length})
              </h3>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {pastMeetings.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-4">No past meetings</p>
              ) : (
                pastMeetings.map((m) => <MeetingCard key={m.meeting_id} m={m} />)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* All meetings list view */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>All Meetings</h3>
          <span className="text-xs text-zinc-400">{meetings.length} total</span>
        </div>
        {loading ? (
          <div className="py-12 text-center text-zinc-400 text-sm">Loading meetings…</div>
        ) : meetings.length === 0 ? (
          <div className="py-12 text-center">
            <Calendar className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">No meetings yet</p>
            {canManageMeetings(user?.role) && (
              <button onClick={() => setShowCreate(true)}
                className="mt-3 text-xs text-indigo-600 font-semibold hover:underline">
                Schedule your first meeting →
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-50 p-4 space-y-2">
            {[...upcomingMeetings, ...pastMeetings].map((m) => (
              <MeetingCard key={m.meeting_id} m={m} />
            ))}
          </div>
        )}
      </div>

      {/* Create Meeting Modal */}
      {showCreate && canManageMeetings(user?.role) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Schedule Meeting</h3>
              <button onClick={() => { setShowCreate(false); setCreateError(""); }} className="p-1 rounded-lg hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {createError}
              </div>
            )}

            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Title *</label>
                <input required data-testid="meeting-title-input"
                  value={newMeeting.title} onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                  placeholder="Meeting title"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={newMeeting.description} onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                  rows={2} placeholder="What's this meeting about?"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Start Time *</label>
                  <input required type="datetime-local" data-testid="meeting-start-input"
                    min={nowMin}
                    value={newMeeting.start_time} onChange={(e) => setNewMeeting({ ...newMeeting, start_time: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">End Time *</label>
                  <input required type="datetime-local"
                    min={nowMin}
                    value={newMeeting.end_time} onChange={(e) => setNewMeeting({ ...newMeeting, end_time: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <textarea value={newMeeting.notes} onChange={(e) => setNewMeeting({ ...newMeeting, notes: e.target.value })}
                  rows={2} placeholder="Agenda or notes…"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Attendees ({newMeeting.attendee_ids.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-zinc-200 rounded-lg p-2">
                  {allUsers.map((u) => (
                    <label key={u.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 cursor-pointer">
                      <input type="checkbox"
                        checked={newMeeting.attendee_ids.includes(u.user_id)}
                        onChange={() => toggleAttendee(u.user_id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">
                        {u.name?.[0]}
                      </div>
                      <span className="text-sm text-zinc-700">{u.name}</span>
                      <span className="text-[10px] text-zinc-400 ml-auto capitalize">{u.role?.replace("_", " ")}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setCreateError(""); }}
                  className="flex-1 border border-zinc-200 text-zinc-700 rounded-lg py-2 text-sm hover:bg-zinc-50 transition-all">
                  Cancel
                </button>
                <button data-testid="submit-create-meeting" type="submit"
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 transition-all">
                  Schedule Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
