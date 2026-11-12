import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:gal/gal.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'passenger_store.dart';
import 'passenger_widgets.dart';

/// Renders a VietQR payload onto a white-background canvas with the amount
/// and transfer memo written underneath, returning PNG image bytes.
Future<Uint8List> renderPaymentQrImage({
  required String qrData,
  required int amount,
  required String memo,
}) async {
  const double width = 640;
  const double padding = 48;
  const double qrSize = width - (padding * 2);

  final qrPainter = QrPainter(
    data: qrData,
    version: QrVersions.auto,
    gapless: true,
    errorCorrectionLevel: QrErrorCorrectLevel.M,
  );

  final amountSpan = TextSpan(
    text: 'Số tiền: ${vnd(amount)}',
    style: const TextStyle(
      color: Color(0xFF0F172A),
      fontSize: 26,
      fontWeight: FontWeight.w700,
    ),
  );
  final amountPainter = TextPainter(
    text: amountSpan,
    textDirection: TextDirection.ltr,
    textAlign: TextAlign.center,
  )..layout(maxWidth: qrSize);

  final memoSpan = TextSpan(
    text: 'Nội dung: $memo',
    style: const TextStyle(
      color: Color(0xFF334155),
      fontSize: 22,
      fontWeight: FontWeight.w600,
    ),
  );
  final memoPainter = TextPainter(
    text: memoSpan,
    textDirection: TextDirection.ltr,
    textAlign: TextAlign.center,
  )..layout(maxWidth: qrSize);

  final double contentHeight = padding + qrSize + 28 + amountPainter.height + 12 + memoPainter.height + padding;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  // White background
  final bgPaint = Paint()..color = const Color(0xFFFFFFFF);
  canvas.drawRect(Rect.fromLTWH(0, 0, width, contentHeight), bgPaint);

  // QR Code
  canvas.save();
  canvas.translate(padding, padding);
  qrPainter.paint(canvas, const Size(qrSize, qrSize));
  canvas.restore();

  // Amount
  final double amountY = padding + qrSize + 28;
  amountPainter.paint(canvas, Offset(padding + (qrSize - amountPainter.width) / 2, amountY));

  // Memo
  final double memoY = amountY + amountPainter.height + 12;
  memoPainter.paint(canvas, Offset(padding + (qrSize - memoPainter.width) / 2, memoY));

  final picture = recorder.endRecording();
  final img = await picture.toImage(width.toInt(), contentHeight.toInt());
  final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
  return byteData!.buffer.asUint8List();
}

/// Abstract interface for saving QR codes so tests do not need the native plugin.
abstract class QrImageSaver {
  Future<void> savePaymentQr({
    required BuildContext context,
    required String qrData,
    required int amount,
    required String memo,
  });
}

/// Production implementation saving to the device photo gallery via `gal`.
class GalQrImageSaver implements QrImageSaver {
  const GalQrImageSaver();

  @override
  Future<void> savePaymentQr({
    required BuildContext context,
    required String qrData,
    required int amount,
    required String memo,
  }) async {
    if (qrData.isEmpty) {
      if (context.mounted) showToast(context, 'Chưa có mã QR để lưu');
      return;
    }

    const denied = 'Hãy cho phép BusGo lưu ảnh trong Cài đặt';
    try {
      if (!await Gal.hasAccess() && !await Gal.requestAccess()) {
        if (context.mounted) showToast(context, denied);
        return;
      }
    } catch (_) {
      if (context.mounted) showToast(context, denied);
      return;
    }

    try {
      final bytes = await renderPaymentQrImage(
        qrData: qrData,
        amount: amount,
        memo: memo,
      );
      await Gal.putImageBytes(bytes, name: 'vietqr_${DateTime.now().millisecondsSinceEpoch}');
      if (context.mounted) {
        showToast(context, 'Đã lưu ảnh mã QR vào thư viện');
      }
    } on GalException catch (e) {
      if (context.mounted) {
        if (e.type == GalExceptionType.accessDenied) {
          showToast(context, denied);
        } else {
          showToast(context, 'Không lưu được ảnh, vui lòng thử lại');
        }
      }
    } catch (_) {
      if (context.mounted) {
        showToast(context, 'Không lưu được ảnh, vui lòng thử lại');
      }
    }
  }
}

QrImageSaver defaultQrImageSaver = const GalQrImageSaver();
