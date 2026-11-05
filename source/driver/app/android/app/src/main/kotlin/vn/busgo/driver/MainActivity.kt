package vn.busgo.driver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // D192: the office's pushes land in "Chuyến chạy", shown on top with sound (the server names this channel).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("busgo_trip", "Chuyến chạy", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Nhà xe giao chuyến, đổi xe, chuyển hoặc hủy chuyến"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
