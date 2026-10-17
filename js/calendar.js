/* Local date helpers avoid UTC parsing and millisecond-based day arithmetic across DST. */
(() => {
  "use strict";

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function dateKey(date) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(0);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date;
  }

  function monthTitle(year, month) {
    return `${MONTH_NAMES[month]} ${year}`;
  }

  function gridDates(year, month) {
    const first = new Date(year, month, 1);
    const sundayOffset = first.getDay();
    const start = new Date(year, month, 1 - sundayOffset);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }

  function isToday(date, now) {
    return dateKey(date) === dateKey(now);
  }

  function isFuture(date, now) {
    return dateKey(date) > dateKey(now);
  }

  function getSymbol(mark) {
    return typeof mark === "string" ? mark : (mark && typeof mark.symbol === "string" ? mark.symbol : "");
  }

  window.MarkDaysCalendar = { dateKey, parseDateKey, monthTitle, gridDates, isToday, isFuture, getSymbol };
})();
