package com.yourcompany.docstransfer

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*

// Uses Google's Nearby Connections API, which handles discovery + picks the
// best available transport (Bluetooth, BLE, Wi-Fi Direct, or local Wi-Fi hotspot)
// automatically depending on what's available — no internet required.
// Docs: https://developers.google.com/nearby/connections/overview

@CapacitorPlugin(
    name = "NearbyTransfer",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "location"),
        Permission(strings = [Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN], alias = "bluetooth"),
        Permission(strings = [Manifest.permission.NEARBY_WIFI_DEVICES], alias = "nearbyWifi")
    ]
)
class NearbyTransferPlugin : Plugin() {

    private val SERVICE_ID = "com.yourcompany.docstransfer.SERVICE"
    private val STRATEGY = Strategy.P2P_CLUSTER

    private val connectionsClient by lazy { Nearby.getConnectionsClient(context) }

    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        // TODO: check permissions are granted (use requestPermissionForAlias first if not)
        val localName = android.os.Build.MODEL

        // Advertise this device so others can find it
        val advertisingOptions = AdvertisingOptions.Builder().setStrategy(STRATEGY).build()
        connectionsClient.startAdvertising(
            localName, SERVICE_ID, connectionLifecycleCallback, advertisingOptions
        )

        // Discover other devices advertising
        val discoveryOptions = DiscoveryOptions.Builder().setStrategy(STRATEGY).build()
        connectionsClient.startDiscovery(
            SERVICE_ID, endpointDiscoveryCallback, discoveryOptions
        )

        call.resolve()
    }

    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        connectionsClient.stopAdvertising()
        connectionsClient.stopDiscovery()
        call.resolve()
    }

    @PluginMethod
    fun sendFile(call: PluginCall) {
        val deviceId = call.getString("deviceId") ?: return call.reject("deviceId required")
        val filePath = call.getString("filePath") ?: return call.reject("filePath required")

        // TODO: build a Payload from the file (Payload.fromFile / fromStream)
        // and connectionsClient.sendPayload(deviceId, payload)
        // Track progress via a PayloadCallback registered on connect, and emit
        // 'transferProgress' / 'transferComplete' via notifyListeners(...)

        val result = JSObject()
        result.put("transferId", "android-stub")
        call.resolve(result)
    }

    @PluginMethod
    fun acceptTransfer(call: PluginCall) {
        val transferId = call.getString("transferId") ?: return call.reject("transferId required")
        connectionsClient.acceptConnection(transferId, payloadCallback)
        call.resolve()
    }

    @PluginMethod
    fun rejectTransfer(call: PluginCall) {
        val transferId = call.getString("transferId") ?: return call.reject("transferId required")
        connectionsClient.rejectConnection(transferId)
        call.resolve()
    }

    @PluginMethod
    fun getPairingCode(call: PluginCall) {
        // Nearby Connections doesn't need QR pairing (auto-discovery works on its own),
        // but you can still emit a payload string for a manual/offline pairing path.
        val result = JSObject()
        result.put("payload", "{\"serviceId\":\"$SERVICE_ID\"}")
        call.resolve(result)
    }

    @PluginMethod
    fun pairWithCode(call: PluginCall) {
        // Optional manual fallback; most flows won't need this with Nearby Connections.
        call.resolve()
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            val device = JSObject()
            device.put("id", endpointId)
            device.put("name", info.endpointName)
            notifyListeners("deviceFound", device)
        }

        override fun onEndpointLost(endpointId: String) {
            val lost = JSObject()
            lost.put("id", endpointId)
            notifyListeners("deviceLost", lost)
        }
    }

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            val request = JSObject()
            request.put("transferId", endpointId)
            request.put("fileName", "") // fill in once you're carrying file metadata in the connection request
            notifyListeners("incomingRequest", request)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            // TODO: handle success/failure of the connection handshake
        }

        override fun onDisconnected(endpointId: String) {
            // TODO: cleanup
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            // TODO: write payload bytes/stream to disk
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            val progress = JSObject()
            progress.put("transferId", endpointId)
            progress.put("bytesSent", update.bytesTransferred)
            progress.put("totalBytes", update.totalBytes)
            notifyListeners("transferProgress", progress)

            if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
                val complete = JSObject()
                complete.put("transferId", endpointId)
                complete.put("success", true)
                notifyListeners("transferComplete", complete)
            }
        }
    }
}
