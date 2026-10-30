import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// D179: motion of the app, modelled on iOS (UIKit curves and timings), in one place so every screen moves alike.
abstract class Motion {
  static const fast = Duration(milliseconds: 160);
  static const base = Duration(milliseconds: 280);
  static const sheet = Duration(milliseconds: 420);

  /// UIKit's default ease, cubic-bezier(0.25, 0.1, 0.25, 1).
  static const ease = Cubic(0.25, 0.1, 0.25, 1);

  /// A view settling into place: fast start, long soft landing, close to the critically damped spring of iOS.
  static const settle = Curves.fastEaseInToSlowEaseOut;

  /// "Reduce Motion" in the phone settings: things appear at once instead of moving.
  static bool reduced(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// Pushed screens slide in from the right over a dimmed, slightly shifted previous one, and a swipe from the
  /// left edge goes back, on Android as on iOS.
  static const pageTransitions = PageTransitionsTheme(builders: {
    TargetPlatform.android: CupertinoPageTransitionsBuilder(),
    TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
    TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
    TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
    TargetPlatform.fuchsia: CupertinoPageTransitionsBuilder(),
  });

  static const sheetStyle = AnimationStyle(duration: sheet, reverseDuration: base, curve: settle, reverseCurve: Curves.easeInCubic);
}

/// Lists bounce at their ends instead of the Android glow.
class IosScrollBehavior extends MaterialScrollBehavior {
  const IosScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) => const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());

  @override
  Widget buildOverscrollIndicator(BuildContext context, Widget child, ScrollableDetails details) => child;
}

/// Shrinks a little and dims while the finger is down, then springs back, like a UIKit button.
/// It only listens to the pointer, so the child's own tap handling is unchanged.
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, this.enabled = true, this.scale = 0.97});
  final Widget child;
  final bool enabled;
  final double scale;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool down) {
    if (_down != down && mounted) setState(() => _down = down);
  }

  @override
  Widget build(BuildContext context) {
    final pressed = _down && widget.enabled && !Motion.reduced(context);
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: pressed ? widget.scale : 1,
        duration: pressed ? const Duration(milliseconds: 90) : Motion.base,
        curve: pressed ? Curves.easeOut : Curves.easeOutBack,
        child: AnimatedOpacity(
          opacity: pressed ? 0.85 : 1,
          duration: pressed ? const Duration(milliseconds: 90) : Motion.fast,
          child: widget.child,
        ),
      ),
    );
  }
}

/// Fades in and rises a few points into place the first time it is built; [index] staggers the items of a list.
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({super.key, required this.child, this.index = 0});
  final Widget child;
  final int index;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 360));
  late final Animation<double> _t = CurvedAnimation(parent: _c, curve: Motion.settle);
  Timer? _delay;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_c.status != AnimationStatus.dismissed || (_delay?.isActive ?? false)) return;
    if (Motion.reduced(context)) {
      _c.value = 1;
      return;
    }
    // Only the first screenful is staggered: a row built later by scrolling comes in at once.
    final step = widget.index <= 8 ? widget.index : 0;
    if (step == 0) {
      _c.forward();
    } else {
      _delay = Timer(Duration(milliseconds: 40 * step), _c.forward);
    }
  }

  @override
  void dispose() {
    _delay?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _t,
        builder: (context, child) => Opacity(
          opacity: _t.value,
          child: Transform.translate(offset: Offset(0, 14 * (1 - _t.value)), child: child),
        ),
        child: widget.child,
      );
}

/// A banner or a line that comes and goes: the space opens and closes smoothly and the content fades.
class Reveal extends StatelessWidget {
  const Reveal({super.key, required this.visible, required this.child});
  final bool visible;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedSize(
        duration: Motion.reduced(context) ? Duration.zero : Motion.base,
        curve: Motion.ease,
        alignment: Alignment.topCenter,
        child: AnimatedSwitcher(
          duration: Motion.reduced(context) ? Duration.zero : Motion.base,
          child: visible ? KeyedSubtree(key: const ValueKey(true), child: child) : const SizedBox(key: ValueKey(false), width: double.infinity),
        ),
      );
}

/// Tab pages: the page shown fades in like a UITabBarController switch; the others keep their state.
class FadeIndexedStack extends StatefulWidget {
  const FadeIndexedStack({super.key, required this.index, required this.children});
  final int index;
  final List<Widget> children;

  @override
  State<FadeIndexedStack> createState() => _FadeIndexedStackState();
}

class _FadeIndexedStackState extends State<FadeIndexedStack> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 220), value: 1);
  late final Animation<double> _opacity = CurvedAnimation(parent: _c, curve: Motion.ease);

  @override
  void didUpdateWidget(FadeIndexedStack old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index && !Motion.reduced(context)) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _opacity,
        child: IndexedStack(index: widget.index, children: widget.children),
      );
}
