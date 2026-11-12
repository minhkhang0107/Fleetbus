import 'package:app/src/presentation/driver_widgets.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// D179: the iOS-like motion of the app.
void main() {
  double scaleOf(WidgetTester tester) => tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale;

  test('screens slide in the iOS way on every platform, and lists bounce', () {
    final theme = driverTheme();
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      expect(theme.pageTransitionsTheme.builders[platform], isA<CupertinoPageTransitionsBuilder>());
    }
    expect(theme.splashFactory, NoSplash.splashFactory);
    final physics = const IosScrollBehavior().getScrollPhysics(_FakeContext());
    expect(physics, isA<BouncingScrollPhysics>());
  });

  testWidgets('a button shrinks while pressed and springs back on release', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: BigButton(label: 'Tiếp tục', onPressed: () => taps++)))));
    expect(scaleOf(tester), 1);

    final gesture = await tester.startGesture(tester.getCenter(find.text('Tiếp tục')));
    await tester.pump();
    expect(scaleOf(tester), lessThan(1));

    await gesture.up();
    await tester.pumpAndSettle();
    expect(scaleOf(tester), 1);
    expect(taps, 1, reason: 'the press feedback does not swallow the tap');
  });

  testWidgets('a disabled button does not react to a press', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Center(child: BigButton(label: 'Tiếp tục', onPressed: null)))));
    await tester.startGesture(tester.getCenter(find.text('Tiếp tục')));
    await tester.pump();
    expect(scaleOf(tester), 1);
  });

  testWidgets('with Reduce Motion on, nothing moves: a press does not shrink, a list row is there at once', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: Scaffold(body: Column(children: [
          BigButton(label: 'Tiếp tục', onPressed: () {}),
          const FadeSlideIn(index: 3, child: Text('Vé BG-0001')),
        ])),
      ),
    ));
    expect(tester.widget<Opacity>(find.ancestor(of: find.text('Vé BG-0001'), matching: find.byType(Opacity))).opacity, 1);
    await tester.startGesture(tester.getCenter(find.text('Tiếp tục')));
    await tester.pump();
    expect(scaleOf(tester), 1);
  });

  testWidgets('list rows fade and rise in one after another, then rest in place', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: Column(children: [
      FadeSlideIn(index: 0, child: Text('Vé 1')),
      FadeSlideIn(index: 4, child: Text('Vé 5')),
    ]))));
    double opacity(String text) => tester.widget<Opacity>(find.ancestor(of: find.text(text), matching: find.byType(Opacity))).opacity;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(opacity('Vé 1'), greaterThan(0));
    expect(opacity('Vé 5'), 0, reason: 'a later row starts after the earlier ones');
    await tester.pumpAndSettle();
    expect(opacity('Vé 1'), 1);
    expect(opacity('Vé 5'), 1);
  });

  testWidgets('switching tabs fades the new page in and keeps the state of the other', (tester) async {
    var index = 0;
    late StateSetter setIndex;
    await tester.pumpWidget(MaterialApp(home: StatefulBuilder(builder: (context, set) {
      setIndex = set;
      return FadeIndexedStack(index: index, children: const [_Counter(), Text('Vé của tôi')]);
    })));
    await tester.tap(find.text('0'));
    await tester.pump();
    expect(find.text('1'), findsOneWidget);

    setIndex(() => index = 1);
    await tester.pump();
    final fade = tester.widget<FadeTransition>(find.descendant(of: find.byType(FadeIndexedStack), matching: find.byType(FadeTransition)));
    expect(fade.opacity.value, lessThan(1));
    await tester.pumpAndSettle();
    expect(fade.opacity.value, 1);

    setIndex(() => index = 0);
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget, reason: 'the first tab kept its state');
  });

  testWidgets('a banner opens smoothly instead of appearing at full height', (tester) async {
    var visible = false;
    late StateSetter set;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: StatefulBuilder(builder: (context, s) {
      set = s;
      return Column(children: [Reveal(visible: visible, child: const SizedBox(height: 40, child: Text('Không có mạng')))]);
    }))));
    expect(tester.getSize(find.byType(Reveal)).height, 0);
    set(() => visible = true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    final midway = tester.getSize(find.byType(Reveal)).height;
    expect(midway, inExclusiveRange(0, 40));
    await tester.pumpAndSettle();
    expect(tester.getSize(find.byType(Reveal)).height, 40);
  });
}

class _Counter extends StatefulWidget {
  const _Counter();
  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  int n = 0;
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: () => setState(() => n++), child: Text('$n'));
}

class _FakeContext extends Fake implements BuildContext {}
