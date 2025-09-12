import mongoose from "mongoose";

const dutyInfoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    
    // Core Duty Fields
    dutyStartDate: { 
      type: Date, 
      required: true 
    },
    dutyStartTime: { 
      type: String, 
      required: true 
    },
    dutyEndDate: { 
      type: Date, 
      required: true 
    },
    dutyEndTime: { 
      type: String, 
      required: true 
    },
    dutyStartKm: { 
      type: Number, 
      required: true,
      min: 0
    },
    dutyEndKm: { 
      type: Number, 
      required: true,
      min: 0
    },
    dutyType: { 
      type: String, 
      required: true 
    },
    
    // Auto-calculated fields
    totalKm: {
      type: Number,
      default: 0
    },
    totalHours: {
      type: Number,
      default: 0
    },
    totalDays: {
      type: Number,
      default: 1
    },
    
    // Admin tracking fields (for audit trail)
    createdByAdmin: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Admin" 
    },
    createdByRole: { 
      type: String, 
      enum: ["admin", "subadmin", "user"],
      default: "user"
    },
    lastEditedByAdmin: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Admin" 
    },
    lastEditedByRole: { 
      type: String, 
      enum: ["admin", "subadmin", "user"]
    },
    lastEditedAt: { 
      type: Date 
    },
    
    // Notes for duty
    notes: { 
      type: String, 
      default: "" 
    },
  },
  { 
    timestamps: true 
  }
);

// Ensure unique duty info per user & booking
dutyInfoSchema.index({ userId: 1, bookingId: 1 }, { unique: true });
dutyInfoSchema.index({ bookingId: 1 });
dutyInfoSchema.index({ userId: 1 });

// Pre-save hook to calculate totals
dutyInfoSchema.pre("save", function (next) {
  try {
    // Calculate total kilometers
    if (this.dutyEndKm && this.dutyStartKm && this.dutyEndKm >= this.dutyStartKm) {
      this.totalKm = this.dutyEndKm - this.dutyStartKm;
    }
    
    // Calculate total days and hours
    if (this.dutyStartDate && this.dutyEndDate && this.dutyStartTime && this.dutyEndTime) {
      const startDate = new Date(this.dutyStartDate);
      const endDate = new Date(this.dutyEndDate);
      
      // Calculate days
      const timeDiff = endDate.getTime() - startDate.getTime();
      this.totalDays = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1);
      
      // Calculate hours - more precise calculation
      try {
        // Parse time strings (assuming format like "08:30" or "8:30")
        const [startHour, startMin] = this.dutyStartTime.split(':').map(Number);
        const [endHour, endMin] = this.dutyEndTime.split(':').map(Number);
        
        // Create full datetime objects
        const startDateTime = new Date(startDate);
        startDateTime.setHours(startHour, startMin || 0, 0, 0);
        
        const endDateTime = new Date(endDate);
        endDateTime.setHours(endHour, endMin || 0, 0, 0);
        
        // If end time is before start time on same day, assume it's next day
        if (endDateTime <= startDateTime && startDate.getTime() === endDate.getTime()) {
          endDateTime.setDate(endDateTime.getDate() + 1);
        }
        
        // Calculate total hours
        const diffMs = endDateTime - startDateTime;
        this.totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
        
        // Ensure minimum 1 hour if dates are valid
        if (this.totalHours <= 0) {
          this.totalHours = 1;
        }
        
      } catch (error) {
        console.warn('Error calculating hours, using default:', error);
        this.totalHours = 8; // Default 8 hours
      }
    }
    
  } catch (error) {
    console.error('Error in dutyInfo pre-save hook:', error);
  }
  
  next();
});

// Virtual for formatted duration
dutyInfoSchema.virtual('formattedDuration').get(function() {
  if (this.totalHours) {
    const hours = Math.floor(this.totalHours);
    const minutes = Math.round((this.totalHours - hours) * 60);
    return `${hours}h ${minutes}m`;
  }
  return '0h 0m';
});

// Virtual for date range
dutyInfoSchema.virtual('dateRange').get(function() {
  if (this.dutyStartDate && this.dutyEndDate) {
    const start = this.dutyStartDate.toISOString().split('T')[0];
    const end = this.dutyEndDate.toISOString().split('T')[0];
    return start === end ? start : `${start} to ${end}`;
  }
  return '';
});

// Virtual for time range
dutyInfoSchema.virtual('timeRange').get(function() {
  if (this.dutyStartTime && this.dutyEndTime) {
    return `${this.dutyStartTime} - ${this.dutyEndTime}`;
  }
  return '';
});

// Make sure virtuals are included in JSON
dutyInfoSchema.set('toJSON', { virtuals: true });
dutyInfoSchema.set('toObject', { virtuals: true });

export default mongoose.model("DutyInfo", dutyInfoSchema);