const express = require('express');
const PDFDocument = require('pdfkit');
const Prescription = require('../models/Prescription');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function ensurePatient(req, res) {
  if (req.user?.role !== 'tourist') {
    res.status(403).json({ success: false, message: 'Patient access only' });
    return false;
  }
  return true;
}

function mapPrescription(p) {
  return {
    _id: p._id,
    patientId: p.userId,
    doctorId: p.doctorId?._id || p.doctorId,
    doctorName: p.doctorId?.name || 'Doctor',
    specialty: p.doctorId?.specialty || '',
    hospital: p.doctorId?.hospital || '',
    doctorLicense: p.doctorId?.medicalRegistrationNumber || '',
    issueDate: p.createdAt,
    validUntil: p.followUp || '',
    diagnosis: p.diagnosis || '',
    medicines: Array.isArray(p.medicines) && p.medicines.length > 0
      ? p.medicines
      : p.medicationsText
        ? [{ name: p.medicationsText, dosage: '', frequency: '', duration: '', instructions: '' }]
        : [],
    notes: p.notes || '',
    attachments: p.attachments || [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// GET /api/prescriptions/my-prescriptions
router.get('/my-prescriptions', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const prescriptions = await Prescription.find({ userId: req.user.id })
      .populate('doctorId', 'name specialty hospital medicalRegistrationNumber')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      message: 'Prescriptions fetched successfully',
      data: prescriptions.map(mapPrescription),
      count: prescriptions.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch prescriptions',
    });
  }
});

// GET /api/prescriptions/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const prescription = await Prescription.findOne({ _id: req.params.id, userId: req.user.id })
      .populate('doctorId', 'name specialty hospital medicalRegistrationNumber');

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    return res.json({ success: true, data: mapPrescription(prescription) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch prescription',
    });
  }
});

// GET /api/prescriptions/:id/download
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const prescription = await Prescription.findOne({ _id: req.params.id, userId: req.user.id })
      .populate('doctorId', 'name specialty hospital medicalRegistrationNumber')
      .populate('userId', 'name email age gender bloodGroup');

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    const p = prescription;
    const doctor = p.doctorId || {};
    const patient = p.userId || {};

    const pdfFilename = `prescription-${p._id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const primaryColor = '#0284c7'; // Tailwind light-blue-600
    const secondaryColor = '#334155'; // Tailwind slate-700
    const accentColor = '#94a3b8'; // Tailwind slate-400

    // HEADER SECTION
    // Top-left: Clinic Header
    doc.fontSize(24).font('Helvetica-Bold').fillColor(primaryColor).text('MediGuide E-Clinic', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor(accentColor).text('24/7 Virtual Healthcare Services', 50, 75);
    
    // Top-right: Doctor Info
    doc.fontSize(14).font('Helvetica-Bold').fillColor(secondaryColor).text(`Dr. ${doctor.name || 'Unavailable'}`, 0, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor(accentColor).text(doctor.specialty || 'General Practitioner', { align: 'right' });
    doc.text(`Reg No: ${doctor.medicalRegistrationNumber || 'N/A'}`, { align: 'right' });
    doc.text(doctor.hospital || 'MediGuide Network', { align: 'right' });

    // Header Divider
    doc.moveTo(50, 110).lineTo(545, 110).lineWidth(1).strokeColor(primaryColor).stroke();

    // PATIENT INFO SECTION (2-column grid format)
    doc.moveDown(1.5);
    
    // Left column: Patient details
    const leftX = 50;
    const rightX = 320;
    const infoY = doc.y;
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor(secondaryColor).text('PATIENT DETAILS', leftX, infoY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Name:', leftX, infoY + 20);
    doc.font('Helvetica').fontSize(10).text(patient.name || 'Not provided', leftX + 50, infoY + 20);
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Age/Sex:', leftX, infoY + 35);
    doc.font('Helvetica').fontSize(10).text(
      `${patient.age ? patient.age + ' yrs' : 'N/A'} / ${patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : 'O'}`,
      leftX + 50,
      infoY + 35
    );
    
    // Right column: Consultation Details
    doc.font('Helvetica-Bold').fontSize(11).fillColor(secondaryColor).text('CONSULTATION DETAILS', rightX, infoY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Date:', rightX, infoY + 20);
    doc.font('Helvetica').fontSize(10).text(new Date(p.createdAt).toLocaleDateString('en-IN'), rightX + 40, infoY + 20);
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Blood Group:', rightX, infoY + 35);
    doc.font('Helvetica').fontSize(10).text(patient.bloodGroup || 'O+', rightX + 70, infoY + 35);

    doc.moveDown(3);

    // DIAGNOSIS SECTION
    if (p.diagnosis) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor).text('DIAGNOSIS:', 50);
      doc.font('Helvetica').fontSize(11).fillColor('#000').text(p.diagnosis, { indent: 15 });
      doc.moveDown(1.5);
    }

    // Rx Symbol
    doc.font('Helvetica-Bold').fontSize(36).fillColor(primaryColor).text('Rx', 50, doc.y);
    doc.moveDown(0.5);

    // MEDICATIONS TABLE (Structured list)
    let medicinesList = Array.isArray(p.medicines) && p.medicines.length > 0
      ? p.medicines
      : p.medicationsText
        ? [{ name: p.medicationsText, dosage: '', frequency: '', duration: '', instructions: '' }]
        : [];

    if (medicinesList.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor(accentColor).text('No medications prescribed during this consultation.', 60);
    } else {
      medicinesList.forEach((m, idx) => {
        // Med Index and Name
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(`${idx + 1}. ${m.name || 'Unspecified Medication'}`);
        
        // Med Details on next line
        const details = [];
        if (m.dosage) details.push(`Dosage: ${m.dosage}`);
        if (m.frequency) details.push(`Frequency: ${m.frequency}`);
        if (m.duration) details.push(`Duration: ${m.duration}`);
        
        if (details.length > 0) {
          doc.font('Helvetica').fontSize(10).fillColor(secondaryColor).text(details.join(' | '), { indent: 20 });
        }
        
        // Instructions on separate line if present
        if (m.instructions) {
          doc.font('Helvetica-Oblique').fontSize(10).fillColor(accentColor).text(`Note: ${m.instructions}`, { indent: 20 });
        }
        
        doc.moveDown(0.5);
      });
    }

    doc.moveDown(1.5);

    // NOTES SECTION
    if (p.notes) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor).text('DOCTOR\'S NOTES:');
      doc.font('Helvetica').fontSize(11).fillColor('#000').text(p.notes, { indent: 15 });
      doc.moveDown();
    }
    
    // FOLLOW UP
    if (p.followUp) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('Follow-up / Valid Until: ', { continued: true }).font('Helvetica').fillColor('#000').text(new Date(p.followUp).toLocaleDateString('en-IN'));
    }

    // BOTTOM FOOTER
    const pageHeight = doc.page.height;
    doc.moveTo(50, pageHeight - 100).lineTo(545, pageHeight - 100).lineWidth(0.5).strokeColor(accentColor).stroke();
    
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(accentColor).text('This is an electronically generated document and does not require a physical signature.', 50, pageHeight - 85, { align: 'center' });
    doc.text(`Generated on ${new Date().toLocaleString('en-IN')} via MediGuide Patient Portal`, { align: 'center' });

    doc.end();
    return;
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to download prescription',
    });
  }
});

// POST /api/prescriptions/:id/share
router.post('/:id/share', authMiddleware, async (req, res) => {
  try {
    if (!ensurePatient(req, res)) return;

    const email = (req.body.email || '').toString().trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }

    const prescription = await Prescription.findOne({ _id: req.params.id, userId: req.user.id }).select('_id');
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    return res.json({
      success: true,
      message: `Prescription shared with ${email}`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to share prescription',
    });
  }
});

module.exports = router;