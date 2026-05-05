const jwt = require('jsonwebtoken');
const { Appointment, Doctor } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'secret_key');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

function getIceServers() {
  if (process.env.WEBRTC_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(process.env.WEBRTC_ICE_SERVERS);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      console.warn('Invalid WEBRTC_ICE_SERVERS JSON, using fallback STUN server');
    }
  }

  return [{ urls: ['stun:stun.l.google.com:19302'] }];
}

function extractToken(socket) {
  const tokenFromAuth = socket.handshake?.auth?.token;
  if (tokenFromAuth) {
    return tokenFromAuth.startsWith('Bearer ') ? tokenFromAuth.slice(7) : tokenFromAuth;
  }

  const authHeader = socket.handshake?.headers?.authorization;
  if (authHeader) {
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  }

  return null;
}

async function getConsultationAccess(appointmentId, userId) {
  const appointment = await Appointment.findById(appointmentId).select('doctorId userId type appointmentDate videoRoomName videRoomName videoStatus');
  if (!appointment) {
    return { ok: false, code: 404, message: 'Appointment not found' };
  }

  if (appointment.type !== 'teleconsultation') {
    return { ok: false, code: 400, message: 'This is not a teleconsultation appointment' };
  }

  const doctor = await Doctor.findById(appointment.doctorId).select('userId');
  const isDoctorUser = !!doctor && doctor.userId?.toString() === userId;
  const isPatientUser = appointment.userId?.toString() === userId;

  if (!isDoctorUser && !isPatientUser) {
    return { ok: false, code: 403, message: 'Unauthorized access to this appointment' };
  }

  const roomName = appointment.videoRoomName || appointment.videRoomName || `appointment-${appointment._id}`;

  return {
    ok: true,
    appointment,
    roomName: `consultation:${roomName}`,
    role: isDoctorUser ? 'doctor' : 'patient',
  };
}

function initWebRTCSignaling(io) {
  const socketPath = process.env.SOCKET_IO_PATH || '/socket.io';

  io.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) {
        return next(new Error('Missing auth token'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      };
      return next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('webrtc:join-room', async (payload = {}) => {
      try {
        const appointmentId = payload.appointmentId;
        if (!appointmentId) {
          socket.emit('webrtc:error', { message: 'appointmentId is required' });
          return;
        }

        const access = await getConsultationAccess(appointmentId, socket.data.user.id);
        if (!access.ok) {
          socket.emit('webrtc:error', { message: access.message, code: access.code });
          return;
        }

        socket.join(access.roomName);
        socket.data.consultation = {
          appointmentId: String(appointmentId),
          roomName: access.roomName,
          role: access.role,
        };

        const roomSockets = await io.in(access.roomName).fetchSockets();
        const duplicateRoleSockets = roomSockets.filter(
          (peerSocket) =>
            peerSocket.id !== socket.id
            && peerSocket.data?.user?.id === socket.data.user.id
            && peerSocket.data?.consultation?.role === access.role
        );

        duplicateRoleSockets.forEach((peerSocket) => {
          peerSocket.leave(access.roomName);
          peerSocket.disconnect(true);
        });

        const peers = (await io.in(access.roomName).fetchSockets())
          .filter((peerSocket) => peerSocket.id !== socket.id)
          .map((peerSocket) => ({
            socketId: peerSocket.id,
            userId: peerSocket.data?.user?.id,
            role: peerSocket.data?.consultation?.role,
          }));

        socket.emit('webrtc:room-joined', {
          success: true,
          appointmentId: access.appointment._id,
          roomName: access.roomName,
          role: access.role,
          peers,
          iceServers: getIceServers(),
          signalingPath: socketPath,
        });

        socket.to(access.roomName).emit('webrtc:peer-joined', {
          socketId: socket.id,
          userId: socket.data.user.id,
          role: access.role,
        });
      } catch (error) {
        console.error('webrtc:join-room error:', error);
        socket.emit('webrtc:error', { message: 'Failed to join consultation room' });
      }
    });

    socket.on('webrtc:offer', (payload = {}) => {
      const roomName = socket.data?.consultation?.roomName;
      if (!roomName) return;

      if (socket.data?.consultation?.role !== 'doctor') {
        socket.emit('webrtc:error', { message: 'Only the doctor can initiate the video offer' });
        return;
      }

      if (payload.targetSocketId) {
        io.to(payload.targetSocketId).emit('webrtc:offer', {
          appointmentId: socket.data.consultation.appointmentId,
          senderSocketId: socket.id,
          senderUserId: socket.data.user.id,
          sdp: payload.sdp,
        });
        return;
      }

      socket.to(roomName).emit('webrtc:offer', {
        appointmentId: socket.data.consultation.appointmentId,
        senderSocketId: socket.id,
        senderUserId: socket.data.user.id,
        sdp: payload.sdp,
      });
    });

    socket.on('webrtc:answer', (payload = {}) => {
      const roomName = socket.data?.consultation?.roomName;
      if (!roomName) return;

      if (payload.targetSocketId) {
        io.to(payload.targetSocketId).emit('webrtc:answer', {
          appointmentId: socket.data.consultation.appointmentId,
          senderSocketId: socket.id,
          senderUserId: socket.data.user.id,
          sdp: payload.sdp,
        });
        return;
      }

      socket.to(roomName).emit('webrtc:answer', {
        appointmentId: socket.data.consultation.appointmentId,
        senderSocketId: socket.id,
        senderUserId: socket.data.user.id,
        sdp: payload.sdp,
      });
    });

    socket.on('webrtc:ice-candidate', (payload = {}) => {
      const roomName = socket.data?.consultation?.roomName;
      if (!roomName) return;

      if (payload.targetSocketId) {
        io.to(payload.targetSocketId).emit('webrtc:ice-candidate', {
          appointmentId: socket.data.consultation.appointmentId,
          senderSocketId: socket.id,
          senderUserId: socket.data.user.id,
          candidate: payload.candidate,
        });
        return;
      }

      socket.to(roomName).emit('webrtc:ice-candidate', {
        appointmentId: socket.data.consultation.appointmentId,
        senderSocketId: socket.id,
        senderUserId: socket.data.user.id,
        candidate: payload.candidate,
      });
    });

    socket.on('webrtc:leave-room', () => {
      const roomName = socket.data?.consultation?.roomName;
      if (!roomName) return;

      socket.leave(roomName);
      socket.to(roomName).emit('webrtc:peer-left', {
        socketId: socket.id,
        userId: socket.data?.user?.id,
      });

      delete socket.data.consultation;
    });

    socket.on('disconnecting', () => {
      if (socket.data?.consultation?.roomName) {
        socket.to(socket.data.consultation.roomName).emit('webrtc:peer-left', {
          socketId: socket.id,
          userId: socket.data?.user?.id,
        });
      }
    });
  });
}

module.exports = initWebRTCSignaling;
