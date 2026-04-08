import { useState, useEffect } from "react";
import api from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Plus, X, Clock, Users, ChevronLeft, ChevronRight } from "lucide-react";

export default function MeetingsPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [newMeeting, setNewMeeting] = useState({
    title: "", description: "", start_time: "", end_time: "",
    attendee_ids: [], notes: ""
  });

  useEffect(() => {
    Promise.all([api.get("/api/meetings"), api.get("/api/users")])
      .then(([meetingsRes, usersRes]) => {
        setMeetings(meetingsRes.data);
        setAllUsers(usersRes.data.filter((u) => u.user_id !== user?.user_id));
      }).catch(() => {});
  }, [user]);

  // Calendar helpers
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

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

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    try {
      const start = new Date(newMeeting.start_time).toISOString();
      const end = new Date(newMeeting.end_time).toISOString();
      const { data } = await api.post("/api/meetings", {
        ...newMeeting,
        start_time: start,
        end_time: end,
        attendee_ids: newMeeting.attendee_ids,
      });
      setMeetings((m) => [...m, data]);
      setShowCreate(false);
      setNewMeeting({ title: "", description: "", start_time: "", end_time: "", attendee_ids: [], notes: "" });
    } catch {}
  };

  const handleDeleteMeeting = async (id) => {
    await api.delete(`/api/meetings/${id}`).catch(() => {});
    setMeetings((m) => m.filter((x) => x.meeting_id !== id));
  };

  const toggleAttendee = (uid) => {
    setNewMeeting((m) => ({
      ...m,
      attendee_ids: m.attendee_ids.includes(uid)
        ? m.attendee_ids.filter((id) => id !== uid)
        : [...m.attendee_ids, uid],
    }));
  };

  const upcomingMeetings = meetings
    .filter((m) => new Date(m.start_time) >= new Date())
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 5);

  return (
    <div className="space-y-6" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "Outfit, sans-serif" }}>Meetings</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{meetings.length} total meetings</p>
        </div>
        <button
          data-testid="create-meeting-button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> New Meeting
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              {monthNames[month]} {year}
            </h3>
            <div className="flex gap-1">
              <button
                data-testid="prev-month-button"
                onClick={() => setCurrentMonth(new Date(year, month - 1))}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-600" />
              </button>
              <button
                data-testid="next-month-button"
                onClick={() => setCurrentMonth(new Date(year, month + 1))}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>
            </div>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-zinc-400 py-1">{d}</div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for first day */}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const dayMeetings = getMeetingsForDate(day);
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
              const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
              return (
                <button
                  key={day}
                  data-testid={`calendar-day-${day}`}
                  onClick={() => setSelectedDate(new Date(year, month, day))}
                  className={`relative h-10 rounded-lg text-sm font-medium transition-all flex flex-col items-center justify-center ${
                    isSelected ? "bg-indigo-600 text-white" :
                    isToday ? "bg-indigo-50 text-indigo-700 border border-indigo-200" :
                    "hover:bg-zinc-50 text-zinc-700"
                  }`}
                >
                  {day}
                  {dayMeetings.length > 0 && (
                    <div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-white" : "bg-indigo-500"}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected date meetings */}
          {selectedDateMeetings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-100">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              </p>
              <div className="space-y-2">
                {selectedDateMeetings.map((m) => (
                  <div key={m.meeting_id} className="flex items-center gap-3 bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-indigo-900">{m.title}</p>
                      <p className="text-xs text-indigo-600">
                        {new Date(m.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} –{" "}
                        {new Date(m.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteMeeting(m.meeting_id)}
                      data-testid={`delete-meeting-${m.meeting_id}`}
                      className="p-1 rounded hover:bg-indigo-200 text-indigo-400 hover:text-indigo-600 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Meetings Sidebar */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>
            Upcoming
          </h3>
          <div className="space-y-3">
            {upcomingMeetings.length === 0 ? (
              <div className="text-center py-6">
                <Calendar className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">No upcoming meetings</p>
              </div>
            ) : (
              upcomingMeetings.map((m) => (
                <div key={m.meeting_id} data-testid={`meeting-card-${m.meeting_id}`}
                  className="p-3 rounded-xl border border-zinc-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 rounded-lg flex flex-col items-center justify-center text-white">
                      <span className="text-[9px] font-semibold">
                        {new Date(m.start_time).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                      </span>
                      <span className="text-base font-bold leading-tight">{new Date(m.start_time).getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{m.title}</p>
                      <div className="flex items-center gap-1 text-xs text-zinc-500 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(m.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                        <Users className="w-3 h-3" />
                        {m.attendee_ids?.length || 0} attendees
                      </div>
                    </div>
                  </div>
                  {m.description && (
                    <p className="text-xs text-zinc-400 mt-2 ml-12.5 line-clamp-2">{m.description}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Meeting Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "Outfit, sans-serif" }}>Schedule Meeting</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-zinc-100"><X className="w-4 h-4 text-zinc-400" /></button>
            </div>
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
                    value={newMeeting.start_time} onChange={(e) => setNewMeeting({ ...newMeeting, start_time: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">End Time *</label>
                  <input required type="datetime-local"
                    value={newMeeting.end_time} onChange={(e) => setNewMeeting({ ...newMeeting, end_time: e.target.value })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Attendees ({newMeeting.attendee_ids.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-zinc-200 rounded-lg p-2">
                  {allUsers.map((u) => (
                    <label key={u.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 cursor-pointer">
                      <input type="checkbox"
                        checked={newMeeting.attendee_ids.includes(u.user_id)}
                        onChange={() => toggleAttendee(u.user_id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">
                        {u.name[0]}
                      </div>
                      <span className="text-sm text-zinc-700">{u.name}</span>
                      <span className="text-[10px] text-zinc-400 ml-auto capitalize">{u.role?.replace("_", " ")}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 border border-zinc-200 text-zinc-700 rounded-lg py-2 text-sm hover:bg-zinc-50 transition-all">Cancel</button>
                <button data-testid="submit-create-meeting" type="submit"
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 transition-all">Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
