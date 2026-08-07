import Foundation
import Capacitor
import MultipeerConnectivity

// Uses Apple's MultipeerConnectivity, which handles discovery + transport
// (Bluetooth or peer-to-peer Wi-Fi) automatically, fully offline.
// Docs: https://developer.apple.com/documentation/multipeerconnectivity

@objc(NearbyTransferPlugin)
public class NearbyTransferPlugin: CAPPlugin, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {

    private let serviceType = "docs-transfer" // must be <=15 chars, lowercase, hyphens only
    private lazy var peerId = MCPeerID(displayName: UIDevice.current.name)
    private lazy var session = MCSession(peer: peerId, securityIdentity: nil, encryptionPreference: .required)
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var discoveredPeers: [String: MCPeerID] = [:]

    override public func load() {
        session.delegate = self
    }

    @objc func startDiscovery(_ call: CAPPluginCall) {
        advertiser = MCNearbyServiceAdvertiser(peer: peerId, discoveryInfo: nil, serviceType: serviceType)
        advertiser?.delegate = self
        advertiser?.startAdvertisingPeer()

        browser = MCNearbyServiceBrowser(peer: peerId, serviceType: serviceType)
        browser?.delegate = self
        browser?.startBrowsingForPeers()

        call.resolve()
    }

    @objc func stopDiscovery(_ call: CAPPluginCall) {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        call.resolve()
    }

    @objc func sendFile(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let filePath = call.getString("filePath") else {
            call.reject("deviceId and filePath required")
            return
        }
        guard let peer = discoveredPeers[deviceId] else {
            call.reject("Unknown device")
            return
        }

        let fileURL = URL(fileURLWithPath: filePath)
        let transferId = UUID().uuidString

        // Note: real progress events need MCSession's resource-sending progress
        // handler (the Progress object returned below) wired up to notifyListeners.
        session.sendResource(at: fileURL, withName: fileURL.lastPathComponent, toPeer: peer) { error in
            if let error = error {
                self.notifyListeners("transferComplete", data: [
                    "transferId": transferId, "success": false, "error": error.localizedDescription
                ])
            } else {
                self.notifyListeners("transferComplete", data: [
                    "transferId": transferId, "success": true
                ])
            }
        }

        call.resolve(["transferId": transferId])
    }

    @objc func acceptTransfer(_ call: CAPPluginCall) {
        // TODO: hold on to the invitationHandler from didReceiveInvitationFromPeer
        // and call it with (true, session) here.
        call.resolve()
    }

    @objc func rejectTransfer(_ call: CAPPluginCall) {
        // TODO: call the held invitationHandler with (false, nil) here.
        call.resolve()
    }

    @objc func getPairingCode(_ call: CAPPluginCall) {
        let payload = "{\"serviceType\":\"\(serviceType)\",\"peerId\":\"\(peerId.displayName)\"}"
        call.resolve(["payload": payload])
    }

    @objc func pairWithCode(_ call: CAPPluginCall) {
        // Optional manual fallback; MultipeerConnectivity discovery usually
        // doesn't need it.
        call.resolve()
    }

    // MARK: - MCNearbyServiceBrowserDelegate

    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        discoveredPeers[peerID.displayName] = peerID
        notifyListeners("deviceFound", data: ["id": peerID.displayName, "name": peerID.displayName])
    }

    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        discoveredPeers.removeValue(forKey: peerID.displayName)
        notifyListeners("deviceLost", data: ["id": peerID.displayName])
    }

    // MARK: - MCNearbyServiceAdvertiserDelegate

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        notifyListeners("incomingRequest", data: [
            "transferId": peerID.displayName,
            "fromDevice": ["id": peerID.displayName, "name": peerID.displayName]
        ])
        // TODO: store invitationHandler somewhere so acceptTransfer/rejectTransfer can call it
        invitationHandler(true, session) // auto-accept placeholder — replace with real accept flow
    }

    // MARK: - MCSessionDelegate (minimal stubs — fill in as needed)

    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {}
    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {}
    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
    public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
}
