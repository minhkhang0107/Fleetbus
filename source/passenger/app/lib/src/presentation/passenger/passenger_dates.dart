/// Travel days of the passenger app. A day is a plain calendar date in Vietnam time written YYYY-MM-DD, the
/// format the server checks; "today" and the last bookable day come from the server (app config), so a wrong
/// phone clock or time zone cannot shift what the passenger books.
library;

const _weekdayShort = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const _weekdayLong = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const vnWeekdayHeaders = _weekdayShort;

String _two(int n) => n.toString().padLeft(2, '0');

/// The calendar day of an instant in Vietnam (UTC+7, no daylight saving).
String vnDay(DateTime instant) {
  final d = instant.toUtc().add(const Duration(hours: 7));
  return '${d.year.toString().padLeft(4, '0')}-${_two(d.month)}-${_two(d.day)}';
}

/// A strict YYYY-MM-DD that exists in the calendar, as a UTC midnight, or null.
DateTime? parseDay(String value) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (m == null) return null;
  final d = DateTime.utc(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  return '${d.year.toString().padLeft(4, '0')}-${_two(d.month)}-${_two(d.day)}' == value ? d : null;
}

String addDays(String day, int days) {
  final d = parseDay(day)!.add(Duration(days: days));
  return '${d.year.toString().padLeft(4, '0')}-${_two(d.month)}-${_two(d.day)}';
}

int daysBetween(String from, String to) => parseDay(to)!.difference(parseDay(from)!).inDays;

/// The days a passenger may book, from the server's calendar: today .. the last bookable day. A company runs a
/// fixed timetable (D128), so there is no separate "demo" day any more; which of these days have a departure
/// on the chosen route is the store's `runDays`.
class ServiceCalendar {
  const ServiceCalendar({required this.today, required this.lastDate});
  final String today;
  final String lastDate;

  /// Without the server's answer: today from the phone, 14 days ahead (the server still decides).
  factory ServiceCalendar.fallback([DateTime? now]) {
    final today = vnDay(now ?? DateTime.now());
    return ServiceCalendar(today: today, lastDate: addDays(today, 14));
  }

  factory ServiceCalendar.fromJson(Map<String, dynamic>? j) {
    final today = parseDay('${j?['today']}') == null ? null : '${j!['today']}';
    final last = parseDay('${j?['last_date']}') == null ? null : '${j!['last_date']}';
    if (today == null || last == null) return ServiceCalendar.fallback();
    return ServiceCalendar(today: today, lastDate: last);
  }

  /// Every bookable day in order.
  List<String> get days => [for (var i = 0; i <= daysBetween(today, lastDate); i++) addDays(today, i)];

  bool allows(String day) => parseDay(day) != null && day.compareTo(today) >= 0 && day.compareTo(lastDate) <= 0;
}

/// Labels of a travel day.
class TravelDate {
  const TravelDate(this.id, this.short, this.long, {this.relative});
  /// YYYY-MM-DD.
  final String id;
  /// "T6 · 28/08".
  final String short;
  /// "Thứ Sáu, 28/08/2026": the full date with the year, so nobody books the wrong day.
  final String long;
  /// "Hôm nay", "Ngày mai", "Ngày kia" or null.
  final String? relative;

  factory TravelDate.of(String day, {String? today}) {
    final d = parseDay(day) ?? DateTime.utc(1970);
    final wd = d.weekday - 1;
    final dm = '${_two(d.day)}/${_two(d.month)}';
    final offset = today == null || parseDay(today) == null ? null : daysBetween(today, day);
    return TravelDate(day, '${_weekdayShort[wd]} · $dm', '${_weekdayLong[wd]}, $dm/${d.year}', relative: switch (offset) { 0 => 'Hôm nay', 1 => 'Ngày mai', 2 => 'Ngày kia', _ => null });
  }

  String get weekday => short.split(' · ').first;
  String get dayMonth => short.split(' · ').last;
}
