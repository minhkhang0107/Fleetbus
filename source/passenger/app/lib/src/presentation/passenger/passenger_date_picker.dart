import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// Opens the month calendar of the bookable days (today .. +30, from the server). Picking a day closes it.
Future<String?> showTravelDatePicker(BuildContext context) {
  final store = PassengerScope.read(context);
  return showAppSheet<String>(context, builder: (ctx) => _CalendarSheet(store: store));
}

/// Home screen "Ngày đi": the full date (with the year and "Hôm nay"/"Ngày mai"), quick picks and the calendar.
class TravelDateField extends StatelessWidget {
  const TravelDateField({super.key});

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final d = store.travelDate;
    final cal = store.calendar;
    final quick = [cal.today, addDays(cal.today, 1), addDays(cal.today, 2)].where(cal.allows).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Semantics(
        button: true,
        label: 'Ngày đi ${d.long}. Chạm để mở lịch',
        excludeSemantics: true,
        child: InkWell(
          onTap: () async {
            final picked = await showTravelDatePicker(context);
            if (picked != null) store.setDate(picked);
          },
          borderRadius: BorderRadius.circular(PTokens.radiusControl),
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(color: PTokens.surface, borderRadius: BorderRadius.circular(PTokens.radiusControl), border: Border.all(color: PTokens.lineStrong)),
            child: Row(children: [
              const Icon(Icons.calendar_month, color: PTokens.primary),
              const SizedBox(width: 12),
              Expanded(
                // Always two lines, so picking a day never changes the height of the field (D180).
                child: AnimatedSwitcher(
                  duration: Motion.reduced(context) ? Duration.zero : Motion.base,
                  switchInCurve: Motion.settle,
                  layoutBuilder: (current, previous) => Stack(alignment: Alignment.centerLeft, children: [...previous, if (current != null) current]),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(position: Tween<Offset>(begin: const Offset(0, 0.25), end: Offset.zero).animate(animation), child: child),
                  ),
                  child: Column(key: ValueKey(store.date), crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(d.long, style: sans(size: 15, weight: FontWeight.w600)),
                    Text(d.relative ?? 'Còn ${daysBetween(cal.today, store.date)} ngày nữa', style: sans(size: 12, color: PTokens.primary, weight: FontWeight.w600)),
                  ]),
                ),
              ),
              Text('Đổi', style: sans(size: 13, color: PTokens.primary, weight: FontWeight.w600)),
            ]),
          ),
        ),
      ),
      gap(8),
      // Today, tomorrow, the day after: equal tiles, so the row never shifts when one is picked (D181).
      Row(children: [
        for (final (i, day) in quick.indexed) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _QuickDay(day: TravelDate.of(day, today: cal.today), selected: store.date == day, runs: store.hasDeparture(day), onTap: () => store.setDate(day)),
          ),
        ],
      ]),
    ]);
  }
}

class _QuickDay extends StatelessWidget {
  const _QuickDay({required this.day, required this.selected, required this.runs, required this.onTap});
  final TravelDate day;
  final bool selected;
  /// False when the route has no departure that day: still tappable (a dead tile looks broken); its second line
  /// says so and the search then offers the next day that has one.
  final bool runs;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final top = selected ? PTokens.primaryDark : (runs ? PTokens.ink : PTokens.muted);
    final bottom = selected ? PTokens.primaryDark : PTokens.muted;
    return Semantics(
      selected: selected,
      button: true,
      label: '${day.relative ?? day.weekday} ${day.dayMonth}${runs ? '' : ', không có chuyến'}',
      excludeSemantics: true,
      child: Pressable(
        child: InkWell(
          onTap: () {
            if (!selected) HapticFeedback.selectionClick();
            onTap();
          },
          borderRadius: BorderRadius.circular(PTokens.radiusControl),
          child: AnimatedContainer(
            duration: Motion.base,
            curve: Motion.ease,
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            decoration: BoxDecoration(
              color: selected ? PTokens.primarySoft : (runs ? PTokens.surface : PTokens.canvas),
              borderRadius: BorderRadius.circular(PTokens.radiusControl),
              border: Border.all(color: selected ? PTokens.primary : PTokens.line, width: selected ? 1.5 : 1),
            ),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(day.relative ?? day.weekday, maxLines: 1, overflow: TextOverflow.ellipsis, style: sans(size: 13, weight: FontWeight.w600, color: top)),
              Text(runs ? day.dayMonth : 'Không có chuyến', maxLines: 1, overflow: TextOverflow.ellipsis, style: runs ? mono(size: 12, weight: FontWeight.w500, color: bottom) : sans(size: 11, color: bottom)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Search results: every bookable day in a row that scrolls sideways, the chosen one kept in view, and the
/// calendar one tap away.
class TravelDateStrip extends StatefulWidget {
  const TravelDateStrip({super.key, required this.onChanged});
  final ValueChanged<String> onChanged;

  @override
  State<TravelDateStrip> createState() => _TravelDateStripState();
}

class _TravelDateStripState extends State<TravelDateStrip> {
  static const _cell = 64.0;
  static const _spacing = 8.0;
  final _scroll = ScrollController();
  String? _shown;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _reveal(List<TravelDate> days, String selected) {
    if (_shown == selected) return;
    _shown = selected;
    final index = days.indexWhere((d) => d.id == selected);
    if (index < 0) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final target = (index * (_cell + _spacing) - (_scroll.position.viewportDimension - _cell) / 2).clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.animateTo(target, duration: Motion.sheet, curve: Motion.settle);
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = PassengerScope.of(context);
    final days = store.bookableDates;
    final selected = store.date;
    _reveal(days, selected);
    return Row(children: [
      Expanded(
        child: SizedBox(
          height: 64,
          child: ListView.separated(
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            itemCount: days.length,
            separatorBuilder: (context, index) => const SizedBox(width: _spacing),
            itemBuilder: (context, i) {
              final d = days[i];
              final on = d.id == selected;
              final weekend = d.weekday == 'T7' || d.weekday == 'CN';
              // A day without a departure on this route (fixed timetable) is drawn lighter but can still be picked:
              // the results then say there is no trip that day.
              final runs = store.hasDeparture(d.id);
              return Semantics(
                selected: on,
                button: true,
                label: runs ? d.long : '${d.long}, không có chuyến',
                excludeSemantics: true,
                child: InkWell(
                  onTap: () {
                    if (!on) HapticFeedback.selectionClick();
                    widget.onChanged(d.id);
                  },
                  borderRadius: BorderRadius.circular(PTokens.radiusControl),
                  child: AnimatedContainer(
                    duration: Motion.base,
                    curve: Motion.ease,
                    width: _cell,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: on ? PTokens.primary : (runs ? PTokens.surface : PTokens.canvas),
                      borderRadius: BorderRadius.circular(PTokens.radiusControl),
                      border: Border.all(color: on ? PTokens.primary : PTokens.line),
                    ),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(d.relative == 'Hôm nay' ? 'Nay' : d.weekday, style: sans(size: 12, weight: FontWeight.w600, color: on ? Colors.white : (!runs ? PTokens.muted : (weekend ? PTokens.danger : PTokens.muted)))),
                      Text(d.dayMonth, style: mono(size: 15, weight: FontWeight.w700, color: on ? Colors.white : (runs ? PTokens.ink : PTokens.muted))),
                    ]),
                  ),
                ),
              );
            },
          ),
        ),
      ),
      const SizedBox(width: 8),
      SizedBox(
        width: 48,
        height: 64,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(padding: EdgeInsets.zero, side: const BorderSide(color: PTokens.line), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PTokens.radiusControl))),
          onPressed: () async {
            final picked = await showTravelDatePicker(context);
            if (picked != null) widget.onChanged(picked);
          },
          child: const Icon(Icons.calendar_month, color: PTokens.primary, semanticLabel: 'Mở lịch'),
        ),
      ),
    ]);
  }
}

/// Month grids (Monday first) covering the bookable days; other days are greyed and cannot be picked.
class _CalendarSheet extends StatelessWidget {
  const _CalendarSheet({required this.store});
  final PassengerStore store;

  @override
  Widget build(BuildContext context) {
    final cal = store.calendar;
    final first = parseDay(cal.today)!;
    final last = parseDay(cal.lastDate)!;
    final months = <DateTime>[];
    for (var m = DateTime.utc(first.year, first.month); !m.isAfter(DateTime.utc(last.year, last.month)); m = DateTime.utc(m.year, m.month + 1)) {
      months.add(m);
    }
    final lastLabel = TravelDate.of(cal.lastDate).dayMonth;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: (MediaQuery.sizeOf(context).height - MediaQuery.viewInsetsOf(context).bottom) * 0.85),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Text('Chọn ngày đi', style: sans(size: 18, weight: FontWeight.w700)),
        gap(4),
        Text('Đặt trước tối đa ${daysBetween(cal.today, cal.lastDate)} ngày, đến $lastLabel. Giờ theo Việt Nam.', style: sans(size: 13, color: PTokens.muted)),
        if (cal.days.any((d) => !store.hasDeparture(d)))
          Text('Ngày chữ nhạt: không có chuyến trên tuyến này.', style: sans(size: 13, color: PTokens.muted)),
        gap(12),
        Row(children: [
          for (final h in vnWeekdayHeaders)
            Expanded(child: Center(child: Text(h, style: sans(size: 12, weight: FontWeight.w600, color: h == 'CN' || h == 'T7' ? PTokens.danger : PTokens.muted)))),
        ]),
        gap(6),
        Flexible(
          child: SingleChildScrollView(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final m in months) ...[
                Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('Tháng ${m.month}/${m.year}', style: sans(size: 15, weight: FontWeight.w700))),
                _MonthGrid(month: m, store: store),
              ],
            ]),
          ),
        ),
      ]),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({required this.month, required this.store});
  final DateTime month;
  final PassengerStore store;

  @override
  Widget build(BuildContext context) {
    final cal = store.calendar;
    final lead = month.weekday - 1; // Monday first
    final length = DateTime.utc(month.year, month.month + 1, 0).day;
    final cells = <Widget>[
      for (var i = 0; i < lead; i++) const SizedBox.shrink(),
      for (var day = 1; day <= length; day++) _dayCell(context, cal, '${month.year.toString().padLeft(4, '0')}-${month.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}', day),
    ];
    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 4,
      crossAxisSpacing: 4,
      // Square-ish on a phone, flatter on a tablet so two months fit without long scrolling.
      childAspectRatio: pWide(context) ? 2.2 : 1.15,
      children: cells,
    );
  }

  Widget _dayCell(BuildContext context, ServiceCalendar cal, String id, int day) {
    // Every day of the booking window can be picked; a day without a departure is drawn lighter.
    final allowed = cal.allows(id);
    final runs = store.hasDeparture(id);
    final selected = id == store.date;
    final today = id == cal.today;
    return Semantics(
      button: allowed,
      selected: selected,
      enabled: allowed,
      label: runs ? TravelDate.of(id).long : '${TravelDate.of(id).long}, không có chuyến',
      excludeSemantics: true,
      child: InkWell(
        onTap: allowed ? () => Navigator.of(context).pop(id) : null,
        borderRadius: BorderRadius.circular(PTokens.radiusControl),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? PTokens.primary : null,
            borderRadius: BorderRadius.circular(PTokens.radiusControl),
            border: today && !selected ? Border.all(color: PTokens.primary, width: 1.5) : null,
          ),
          child: Text('$day', style: mono(size: 16, weight: selected || today ? FontWeight.w700 : FontWeight.w500, color: selected ? Colors.white : (!allowed ? PTokens.lineStrong : (runs ? PTokens.ink : PTokens.muted)))),
        ),
      ),
    );
  }
}
