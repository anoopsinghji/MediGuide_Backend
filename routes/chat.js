const express = require('express');
const Appointment = require('../models/Appointment');
const Chat = require('../models/Chat');
const Doctor = require('../models/Doctor');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function ensurePatient(req, res) {
  if (req.user?.role !== 'tourist') {
    res.status(403).json({ success: false, message: 'Patient access only' });
    return false;
  }
  return true;
}

async function hasConfirmedAppointment(userId, doctorId) {
  const appointment = await Appointment.findOne({
    userId,
    doctorId,
    status: 'confirmed',
  }).select('_id');

  return !!appointment;
}

function normalizeMessages(messages = []) {
  return messages.map((m) => ({
    _id: m._id,
    sender: m.sender,
    content: m.text || '',
    timestamp: m.timestamp,
    read: !!m.isRead,
  }));
}

function normalizeChatSummary(chat) {
  const last = (chat.messages || []).length > 0 ? chat.messages[chat.messages.length - 1] : null;
  const unreadCount = (chat.messages || []).filter((m) => m.sender === 'doctor' && !m.isRead).length;

  return {
    _id: chat._id,
    patientId: chat.userId,
    doctorId: chat.doctorId?._id || chat.doctorId,
    doctorName: chat.doctorId?.name || 'Doctor',
    specialty: chat.doctorId?.specialty || '',
    lastMessage: last?.text || '',
    lastMessageTime: last?.timestamp || chat.lastMessageAt || chat.updatedAt,
    isRead: unreadCount === 0,
    unreadCount,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

// GET /api/chat
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const chats = await Chat.find({ userId: req.user.id, isActive: true })
      .populate('doctorId', 'name specialty')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    return res.json({
      success: true,
      data: chats.map(normalizeChatSummary),
      count: chats.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch chats' });
  }
});

// GET /api/chat/:doctorId
router.get('/:doctorId', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const { doctorId } = req.params;

    const doctor = await Doctor.findById(doctorId).select('name specialty verified flagged');
    if (!doctor || !doctor.verified || doctor.flagged) {
      return res.status(404).json({ success: false, message: 'Doctor not available' });
    }

    const allowed = await hasConfirmedAppointment(req.user.id, doctorId);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Chat is available only after doctor confirms your appointment',
      });
    }

    let chat = await Chat.findOne({ userId: req.user.id, doctorId, isActive: true }).populate('doctorId', 'name specialty');
    if (!chat) {
      chat = await Chat.create({ userId: req.user.id, doctorId, messages: [], isActive: true });
      chat = await Chat.findById(chat._id).populate('doctorId', 'name specialty');
    }

    return res.json({
      success: true,
      data: {
        ...normalizeChatSummary(chat),
        messages: normalizeMessages(chat.messages || []),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch chat' });
  }
});

// POST /api/chat/:doctorId/send
router.post('/:doctorId/send', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const { doctorId } = req.params;
    const text = req.body.message?.trim();

    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const allowed = await hasConfirmedAppointment(req.user.id, doctorId);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Chat is available only after doctor confirms your appointment',
      });
    }

    let chat = await Chat.findOne({ userId: req.user.id, doctorId, isActive: true });
    if (!chat) {
      chat = await Chat.create({ userId: req.user.id, doctorId, messages: [], isActive: true });
    }

    const message = {
      sender: 'patient',
      senderId: req.user.id,
      text,
      timestamp: new Date(),
      isRead: false,
    };

    chat.messages.push(message);
    chat.lastMessageAt = new Date();
    await chat.save();

    return res.json({
      success: true,
      message: 'Message sent',
      data: {
        sender: 'patient',
        content: text,
        timestamp: message.timestamp,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to send message' });
  }
});

// PUT /api/chat/:doctorId/mark-read
router.put('/:doctorId/mark-read', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const { doctorId } = req.params;
    const chat = await Chat.findOne({ userId: req.user.id, doctorId, isActive: true });

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    chat.messages.forEach((m) => {
      if (m.sender === 'doctor' && !m.isRead) {
        m.isRead = true;
      }
    });

    await chat.save();
    return res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update messages' });
  }
});

module.exports = router;