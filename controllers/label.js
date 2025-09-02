import Label from '../models/label.js';
import Booking from '../models/Booking.js';

export const createLabel = async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin','subadmin'].includes(role)) return res.status(403).json({ message: 'Forbidden' });
    const { name, color } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required' });
    const label = await Label.create({ name: name.trim(), color, createdBy: req.user.userId, role });
    res.status(201).json({ message: 'Label created', label });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Label already exists' });
    console.error('createLabel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getLabels = async (_req, res) => {
  try {
    const labels = await Label.find().sort({ name: 1 });
    res.json({ labels });
  } catch (err) {
    console.error('getLabels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// body: { labels:[id,...], mode: 'replace'|'add'|'remove' }
export const setBookingLabels = async (req, res) => {
  try {
    if (!['admin','subadmin'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const { bookingId } = req.params;
    const { labels = [], mode = 'replace' } = req.body || {};
    const booking = await Booking.findById(bookingId).populate('labels');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const list = Array.isArray(labels) ? labels : [];
    if (mode === 'replace') {
      booking.labels = list;
    } else if (mode === 'add') {
      const s = new Set(booking.labels.map(i=>i.toString()));
      list.forEach(id=>s.add(id));
      booking.labels = Array.from(s);
    } else if (mode === 'remove') {
      booking.labels = booking.labels.filter(id => !list.includes(id.toString()));
    }
    await booking.save();
    await booking.populate('labels');
    res.json({ message: 'Labels updated', labels: booking.labels });
  } catch (err) {
    console.error('setBookingLabels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export default { createLabel, getLabels, setBookingLabels };