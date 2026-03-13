package com.tappycharge.app

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log

/**
 * Tappy Charge HCE Service
 * 
 * Emuleert een NFC laadpas door te reageren op APDU commando's van laadpaal readers.
 * De service stuurt de opgeslagen token UID terug wanneer een SELECT commando wordt ontvangen.
 */
class HceService : HostApduService() {
    
    companion object {
        private const val TAG = "TappyChargeHCE"
        
        // Tappy Charge AID: F0 43 68 61 72 67 65 54 61 70 (F0ChargeTap)
        // F0 = proprietary AID, rest = "ChargeTap" in ASCII
        private val CHARGETAP_AID = byteArrayOf(
            0xF0.toByte(), 0x43, 0x68, 0x61, 0x72, 0x67, 0x65, 0x54, 0x61, 0x70
        )
        
        // APDU Response codes
        private val SW_SUCCESS = byteArrayOf(0x90.toByte(), 0x00)
        private val SW_UNKNOWN = byteArrayOf(0x6F.toByte(), 0x00)
        private val SW_INS_NOT_SUPPORTED = byteArrayOf(0x6D.toByte(), 0x00)
        private val SW_FILE_NOT_FOUND = byteArrayOf(0x6A.toByte(), 0x82.toByte())
        private val SW_CONDITIONS_NOT_SATISFIED = byteArrayOf(0x69.toByte(), 0x85.toByte())
        
        // APDU Instructions
        private const val INS_SELECT = 0xA4.toByte()
        private const val INS_READ_BINARY = 0xB0.toByte()
        private const val INS_GET_DATA = 0xCA.toByte()
        
        // Shared preferences keys
        const val PREFS_NAME = "tappycharge_hce"
        const val KEY_TOKEN_UID = "token_uid"
        const val KEY_HCE_ENABLED = "hce_enabled"
    }
    
    private lateinit var prefs: SharedPreferences
    
    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        Log.d(TAG, "HCE Service created")
    }
    
    /**
     * Verwerk inkomende APDU commando's van de NFC reader
     */
    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        if (commandApdu == null || commandApdu.size < 4) {
            Log.w(TAG, "Received invalid APDU")
            return SW_UNKNOWN
        }
        
        // Check if HCE is enabled
        if (!prefs.getBoolean(KEY_HCE_ENABLED, false)) {
            Log.d(TAG, "HCE is disabled")
            return SW_CONDITIONS_NOT_SATISFIED
        }
        
        val cla = commandApdu[0]
        val ins = commandApdu[1]
        val p1 = commandApdu[2]
        val p2 = commandApdu[3]
        
        Log.d(TAG, "Received APDU: CLA=${cla.toHex()} INS=${ins.toHex()} P1=${p1.toHex()} P2=${p2.toHex()}")
        
        return when (ins) {
            INS_SELECT -> handleSelect(commandApdu)
            INS_READ_BINARY -> handleReadBinary()
            INS_GET_DATA -> handleGetData()
            else -> {
                Log.d(TAG, "Unsupported instruction: ${ins.toHex()}")
                SW_INS_NOT_SUPPORTED
            }
        }
    }
    
    /**
     * Handle SELECT APDU (voor AID selectie)
     */
    private fun handleSelect(apdu: ByteArray): ByteArray {
        if (apdu.size < 5) {
            return SW_UNKNOWN
        }
        
        val lc = apdu[4].toInt() and 0xFF
        if (apdu.size < 5 + lc) {
            return SW_UNKNOWN
        }
        
        val aidData = apdu.copyOfRange(5, 5 + lc)
        
        // Check if it's our AID
        if (aidData.contentEquals(CHARGETAP_AID)) {
            Log.d(TAG, "Tappy Charge AID selected successfully")
            return SW_SUCCESS
        }
        
        Log.d(TAG, "Unknown AID: ${aidData.toHexString()}")
        return SW_FILE_NOT_FOUND
    }
    
    /**
     * Handle READ BINARY - return token UID
     */
    private fun handleReadBinary(): ByteArray {
        val tokenUid = prefs.getString(KEY_TOKEN_UID, null)
        
        if (tokenUid.isNullOrEmpty()) {
            Log.w(TAG, "No token UID configured")
            return SW_CONDITIONS_NOT_SATISFIED
        }
        
        Log.d(TAG, "Returning token UID: ${tokenUid.takeLast(4)}")
        
        // Convert hex string to bytes and append success code
        val uidBytes = tokenUid.hexToByteArray()
        return uidBytes + SW_SUCCESS
    }
    
    /**
     * Handle GET DATA - alternative way to get token
     */
    private fun handleGetData(): ByteArray {
        return handleReadBinary()
    }
    
    /**
     * Deactivation callback
     */
    override fun onDeactivated(reason: Int) {
        val reasonStr = when (reason) {
            DEACTIVATION_LINK_LOSS -> "Link loss"
            DEACTIVATION_DESELECTED -> "Deselected"
            else -> "Unknown ($reason)"
        }
        Log.d(TAG, "HCE deactivated: $reasonStr")
    }
    
    // Extension functions for hex conversion
    private fun Byte.toHex(): String = String.format("%02X", this)
    
    private fun ByteArray.toHexString(): String = joinToString("") { it.toHex() }
    
    private fun String.hexToByteArray(): ByteArray {
        val len = this.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(this[i], 16) shl 4) + Character.digit(this[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }
}
