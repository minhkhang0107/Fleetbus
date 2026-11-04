package vn.busgo.passenger

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // D192: pushes land in "Chuyến đi", shown on top with sound (the server names this channel).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("busgo_trip", "Chuyến đi", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Thanh toán, xe sắp tới, đổi giờ, đổi xe, hủy chuyến"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
