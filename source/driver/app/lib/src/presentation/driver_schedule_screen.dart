import 'package:flutter/material.dart';

import 'driver_store.dart';
import 'driver_widgets.dart';

/// DRI-021: Driver's monthly trip schedule (Lịch chạy theo tháng).
class DriverScheduleScreen extends StatefulWidget {
  const DriverScheduleScreen({super.key});

  @override
  State<DriverScheduleScreen> createState() => _DriverScheduleScreenState();
}

class _DriverScheduleScreenState extends State<DriverScheduleScreen> {
  late String _currentMonth;
  String? _selectedDate;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    _currentMonth = '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}';
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final store = DriverScope.of(context);
    if (store.scheduleData == null && !store.scheduleLoading && store.scheduleError == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          store.loadMonthlySchedule(_currentMonth);
        }
      });
    }
  }

  static String _shiftMonth(String yyyyMm, int delta) {
    final parts = yyyyMm.split('-');
    if (parts.length < 2) return yyyyMm;
    final year = int.parse(parts[0]);
    final month = int.parse(parts[1]);
    final date = DateTime.utc(year, month + delta);
    return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}';
  }

  static int _monthDiff(String a, String b) {
    final pa = a.split('-').map(int.parse).toList();
    final pb = b.split('-').map(int.parse).toList();
    return (pa[0] - pb[0]) * 12 + (pa[1] - pb[1]);
  }

  static String _formatMonthHeader(String yyyyMm) {
    final p = yyyyMm.split('-');
    if (p.length < 2) return yyyyMm;
    return 'Tháng ${int.parse(p[1])}/${p[0]}';
  }

  static String _formatDay(String yyyyMmDd) {
    final p = yyyyMmDd.split('-');
    if (p.length < 3) return yyyyMmDd;
    return '${p[2]}/${p[1]}/${p[0]}';
  }

  void _ensureSelectedDate(ScheduleMonthData data) {
    final todayMonth = data.today.length >= 7 ? data.today.substring(0, 7) : '';
    if (_selectedDate == null || !_selectedDate!.startsWith(data.month)) {
      if (data.month == todayMonth) {
        _selectedDate = data.today;
      } else {
        final firstWithTrips = data.days.cast<ScheduleDay?>().firstWhere(
              (d) => d != null && d.trips.isNotEmpty,
              orElse: () => null,
            );
        _selectedDate = firstWithTrips?.date ?? '${data.month}-01';
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = DriverScope.of(context);
    final data = store.scheduleData;
    final wide = dWide(context);
    if (data != null) {
      if (_currentMonth != data.month) {
        _currentMonth = data.month;
      }
      _ensureSelectedDate(data);
    }

    final refMonth = store.scheduleReferenceMonth ?? (data != null && data.today.length >= 7 ? data.today.substring(0, 7) : _currentMonth);
    final diff = _monthDiff(_currentMonth, refMonth);
    final canGoPrev = diff > -3;
    final canGoNext = diff < 3;

    final canPop = ModalRoute.of(context)?.canPop ?? false;

    return Scaffold(
      appBar: canPop ? const DHeader(title: 'Lịch chạy') : null,
      body: SafeArea(
        child: DMaxWidth(
          child: RefreshIndicator(
            onRefresh: () => store.loadMonthlySchedule(_currentMonth),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.all(wide ? 24 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!canPop) ...[
                    Text('Lịch chạy', style: dsans(size: 22, weight: FontWeight.w700)),
                    const SizedBox(height: 12),
                  ],
                  _buildMonthHeader(store, canGoPrev, canGoNext),
                  const SizedBox(height: 12),
                  if (store.scheduleLoading && data == null) ...[
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ] else if (store.scheduleError != null) ...[
                    _buildErrorView(store),
                  ] else if (data != null) ...[
                    _buildCalendar(context, data),
                    if (data.summary.total > 0) _buildMonthSummary(data.summary),
                    _buildDaySection(context, data),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMonthHeader(DriverStore store, bool canGoPrev, bool canGoNext) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: DTokens.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DTokens.line),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Tháng trước',
            onPressed: canGoPrev
                ? () {
                    final prev = _shiftMonth(_currentMonth, -1);
                    setState(() {
                      _currentMonth = prev;
                      _selectedDate = null;
                    });
                    store.loadMonthlySchedule(prev);
                  }
                : null,
          ),
          Text(
            _formatMonthHeader(_currentMonth),
            style: dsans(size: 17, weight: FontWeight.w700),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Tháng sau',
            onPressed: canGoNext
                ? () {
                    final next = _shiftMonth(_currentMonth, 1);
                    setState(() {
                      _currentMonth = next;
                      _selectedDate = null;
                    });
                    store.loadMonthlySchedule(next);
                  }
                : null,
          ),
        ],
      ),
    );
  }

  Widget _buildErrorView(DriverStore store) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            store.scheduleError ?? 'Có lỗi, thử lại sau.',
            style: dsans(size: 15, color: DTokens.dangerInk),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          BigButton(
            label: 'Thử lại',
            onPressed: () => store.loadMonthlySchedule(_currentMonth),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendar(BuildContext context, ScheduleMonthData data) {
    final monthStr = data.month.isNotEmpty ? data.month : _currentMonth;
    final parts = monthStr.split('-').map(int.tryParse).whereType<int>().toList();
    final year = parts.isNotEmpty ? parts[0] : 2026;
    final month = parts.length > 1 ? parts[1] : 10;
    final firstDay = DateTime.utc(year, month, 1);
    final lead = firstDay.weekday - 1;
    final numDays = DateTime.utc(year, month + 1, 0).day;

    const weekdayHeaders = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

    final cells = <Widget>[
      for (var i = 0; i < lead; i++) const SizedBox.shrink(),
      for (var day = 1; day <= numDays; day++) _buildDayCell(context, data, day, year, month),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (final label in weekdayHeaders)
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Text(
                      label,
                      style: dsans(
                        size: 13,
                        weight: FontWeight.w600,
                        color: (label == 'T7' || label == 'CN') ? DTokens.dangerInk : DTokens.muted,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          childAspectRatio: dWide(context) ? 1.6 : 1.0,
          children: cells,
        ),
      ],
    );
  }

  Widget _buildDayCell(BuildContext context, ScheduleMonthData data, int day, int year, int month) {
    final dateStr = '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
    final isToday = dateStr == data.today;
    final isSelected = dateStr == _selectedDate;
    final trips = data.tripsByDate[dateStr] ?? const [];
    final hasTrips = trips.isNotEmpty;

    return Semantics(
      button: true,
      selected: isSelected,
      label: hasTrips ? 'Ngày $day, ${trips.length} chuyến' : 'Ngày $day, không có chuyến',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => setState(() => _selectedDate = dateStr),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? DTokens.primary : (hasTrips ? DTokens.panel : Colors.transparent),
            borderRadius: BorderRadius.circular(8),
            border: isToday
                ? Border.all(color: isSelected ? Colors.white : DTokens.primary, width: 2)
                : (isSelected ? Border.all(color: DTokens.primary, width: 2) : Border.all(color: DTokens.lineSoft)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                day.toString().padLeft(2, '0'),
                style: dmono(
                  size: 14,
                  weight: isSelected || isToday ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? Colors.white : (hasTrips ? DTokens.ink : DTokens.muted),
                ),
              ),
              if (hasTrips) ...[
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: isSelected ? Colors.white : DTokens.primary,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${trips.length}',
                    style: dsans(
                      size: 10,
                      weight: FontWeight.w700,
                      color: isSelected ? DTokens.primary : Colors.white,
                    ),
                  ),
                ),
              ] else ...[
                const SizedBox(height: 14),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMonthSummary(ScheduleSummary summary) {
    final summaryText = '${summary.total} chuyến · ${summary.completed} đã chạy · ${summary.upcoming} sắp chạy'
        '${summary.cancelled > 0 ? ' · ${summary.cancelled} đã hủy' : ''}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Text(
        summaryText,
        style: dsans(size: 14, color: DTokens.sub, weight: FontWeight.w500),
      ),
    );
  }

  Widget _buildDaySection(BuildContext context, ScheduleMonthData data) {
    final selectedTrips = _selectedDate != null ? (data.tripsByDate[_selectedDate!] ?? const []) : const <ScheduleTrip>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_selectedDate != null) ...[
          Text(
            'Chuyến ngày ${_formatDay(_selectedDate!)}${selectedTrips.isNotEmpty ? ' (${selectedTrips.length} chuyến)' : ''}',
            style: dsans(size: 16, weight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
        ],
        if (data.summary.total == 0) ...[
          const Panel(
            child: Text(
              'Tháng này bạn chưa có chuyến nào.',
              style: TextStyle(color: DTokens.muted, fontSize: 14),
            ),
          ),
        ] else if (selectedTrips.isEmpty) ...[
          const Panel(
            child: Text(
              'Không có chuyến trong ngày này.',
              style: TextStyle(color: DTokens.muted, fontSize: 14),
            ),
          ),
        ] else ...[
          for (var i = 0; i < selectedTrips.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _TripCard(trip: selectedTrips[i]),
          ],
        ],
      ],
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});
  final ScheduleTrip trip;

  @override
  Widget build(BuildContext context) {
    final (statusText, pillKind) = switch (trip.status) {
      'SCHEDULED' => ('Sắp chạy', DPill.warn),
      'IN_TRANSIT' => ('Đang chạy', DPill.info),
      'COMPLETED' => ('Đã chạy', DPill.ok),
      'CANCELLED' => ('Đã hủy', DPill.danger),
      _ => ('Sắp chạy', DPill.warn),
    };

    final plateText = (trip.vehiclePlate != null && trip.vehiclePlate!.isNotEmpty)
        ? trip.vehiclePlate!
        : 'Chưa có xe';

    final metaParts = <String>[
      if (trip.passengers != null) '${trip.passengers} khách',
      if (trip.status == 'COMPLETED' && trip.cashHandedInVnd != null)
        'Đã nộp ${vnd(trip.cashHandedInVnd!)}',
    ];

    return Panel(
      border: DTokens.line,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(trip.departure, style: dmono(size: 16)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  trip.routeName ?? 'Chưa rõ tuyến',
                  style: dsans(size: 15, weight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: DTokens.bg,
                  border: Border.all(color: const Color(0xFF9A3412)),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  plateText,
                  style: dmono(size: 13, weight: FontWeight.w600, color: DTokens.plate),
                ),
              ),
              const Spacer(),
              StatusPill(statusText, pillKind),
            ],
          ),
          if (metaParts.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              metaParts.join(' · '),
              style: dsans(size: 13, color: DTokens.sub),
            ),
          ],
          if (trip.source == 'SCHEDULE_DEFAULT') ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: DTokens.panel2,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: DTokens.line),
              ),
              child: Text(
                'Lịch mặc định',
                style: dsans(size: 12, color: DTokens.sub, weight: FontWeight.w500),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
