import 'dart:async';

import 'package:flutter/material.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

OverlayEntry? _activeEntry;
_HeadsUpCardState? _activeState;

/// Slides the heads-up card away, if one shows (D191).
void hideHeadsUp() {
  final state = _activeState;
  if (state != null && state.mounted) {
    state.dismiss();
  } else {
    _removeActive();
  }
}

void _removeActive() {
  try {
    _activeEntry?.remove();
  } catch (_) {}
  _activeEntry = null;
  _activeState = null;
}

/// D191: a new notice floats over the top of the app, like the phone's own notifications, so nothing on the page moves.
void showHeadsUp(
  BuildContext context, {
  required AppNotice notice,
  required VoidCallback? onTap,
  Duration? duration,
}) {
  // A newer notice takes the place of the one showing, at once.
  _removeActive();

  final overlay = Overlay.of(context, rootOverlay: true);

  String operatorName = 'BusGo';
  try {
    final store = PassengerScope.read(context);
    final op = store.operator?.name.trim();
    if (op != null && op.isNotEmpty) operatorName = op;
  } catch (_) {}

  final effDuration = duration ??
      (AppNotice.alertTypes.contains(notice.type)
          ? const Duration(seconds: 10)
          : const Duration(seconds: 5));

  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (ctx) => Positioned(
      top: 0,
      left: 0,
      right: 0,
      // Clipped at the bottom of the status bar: the card comes out from under it and never passes behind the
      // clock and the battery, which the phone draws over the app.
      child: SafeArea(
        bottom: false,
        child: ClipRect(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              // The overlay sits above the page's Scaffold: a Material gives the text its style (no debug underline).
              child: Material(
                type: MaterialType.transparency,
                child: _HeadsUpCard(
                  key: const ValueKey('heads_up_card'),
                  entry: entry,
                  notice: notice,
                  operatorName: operatorName,
                  duration: effDuration,
                  onTap: onTap,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  _activeEntry = entry;
  overlay.insert(entry);
}

class _HeadsUpCard extends StatefulWidget {
  const _HeadsUpCard({
    super.key,
    required this.entry,
    required this.notice,
    required this.operatorName,
    required this.duration,
    required this.onTap,
  });

  final OverlayEntry entry;
  final AppNotice notice;
  final String operatorName;
  final Duration duration;
  final VoidCallback? onTap;

  @override
  State<_HeadsUpCard> createState() => _HeadsUpCardState();
}

class _HeadsUpCardState extends State<_HeadsUpCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Offset> _offsetAnimation;
  late final Animation<double> _fadeAnimation;
  Timer? _timer;
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    _activeState = this;
    _controller = AnimationController(
      vsync: this,
      duration: Motion.base,
      reverseDuration: Motion.base,
    );
    _offsetAnimation = Tween<Offset>(
      begin: const Offset(0, -1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
      reverseCurve: Curves.easeIn,
    ));
    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
      reverseCurve: Curves.easeIn,
    );

    _controller.forward();
    _timer = Timer(widget.duration, () => dismiss());
  }

  void dismiss({VoidCallback? andThen}) {
    if (_dismissed) {
      andThen?.call();
      return;
    }
    _dismissed = true;
    _timer?.cancel();
    _timer = null;
    if (!mounted) {
      _removeEntry();
      andThen?.call();
      return;
    }
    _controller.reverse().then((_) {
      _removeEntry();
      andThen?.call();
    }).catchError((_) {
      _removeEntry();
      andThen?.call();
    });
  }

  void _removeEntry() {
    if (_activeEntry == widget.entry) {
      _activeEntry = null;
      _activeState = null;
    }
    try {
      widget.entry.remove();
    } catch (_) {}
  }

  void _handleTap() {
    dismiss(andThen: widget.onTap);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _timer = null;
    if (_activeState == this) {
      _activeState = null;
    }
    if (_activeEntry == widget.entry) {
      _activeEntry = null;
    }
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // The gap above the card slides with it, so at the start and the end of the slide nothing shows under the
    // status bar; the room below keeps the shadow inside the clip.
    return SlideTransition(
      position: _offsetAnimation,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 24),
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: Semantics(
            liveRegion: true,
            button: widget.onTap != null,
            label: '${widget.notice.title}, ${widget.notice.body}',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _handleTap,
              onVerticalDragUpdate: (details) {
                if (details.primaryDelta != null &&
                    details.primaryDelta! < -4) {
                  dismiss();
                }
              },
              onVerticalDragEnd: (details) {
                if ((details.primaryVelocity ?? 0) < -50) {
                  dismiss();
                }
              },
              child: Container(
                key: const Key('heads_up'),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x1F0F172A),
                      blurRadius: 16,
                      offset: Offset(0, 6),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            color: PTokens.primary,
                            borderRadius: BorderRadius.circular(5),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(Icons.directions_bus,
                              size: 14, color: Colors.white),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${widget.operatorName} · bây giờ',
                            style: sans(size: 12, color: PTokens.muted),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      widget.notice.title,
                      style: sans(size: 15, weight: FontWeight.w700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.notice.body,
                      style: sans(size: 13, color: PTokens.ink, height: 1.3),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
