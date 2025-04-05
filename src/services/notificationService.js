import axios from "axios";

export const notificationService = {
  /**
   * Send SMS notification when unknown person is detected
   * @param {string} phone - Phone number to send SMS to
   * @param {string} message - Message content
   * @param {number} distance - Estimated distance of detected person
   * @returns {Promise} - API response
   */
  async sendSMS(phone, message, distance) {
    try {
      const baseUrl = "http://its.idealsms.in/pushsms.php";
      const params = {
        username: process.env.REACT_APP_SMS_USERNAME,
        api_password: process.env.REACT_APP_SMS_API_PASSWORD,
        sender: process.env.REACT_APP_SMS_SENDER,
        to: process.env.REACT_APP_PHONE,
        message: `Alert: An unknown person has been detected. ${"Camera 1"} Please check immediately. IDLSMS`,
        priority: process.env.REACT_APP_SMS_PRIORITY,
        e_id: process.env.REACT_APP_SMS_E_ID,
        t_id: process.env.REACT_APP_SMS_T_ID,
      };
      const response = await axios.get(baseUrl, { params });
      console.log("SMS sent successfully:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error sending SMS:", error);
      throw error;
    }
  },

  /**
   * Send both SMS and email notifications
   * @param {Object} detection - Detection data object
   * @param {string} phone - Phone number to send SMS to
   * @param {string} email - Email address to send to
   */
  async notifyUnknownPerson(detection, phone, email) {
    const timestamp = new Date(detection.timestamp).toLocaleString();
    const message = `Unknown person detected at ${timestamp}`;

    try {
      // Send SMS
      await this.sendSMS(phone, message, detection.estimatedDistance);

      // Send email with image
      if (email) {
        const subject = "Security Alert: Unknown Person Detected";
        const emailMessage = `
          Unknown person detected at ${timestamp}
          Distance: ~${detection.estimatedDistance}m
          Confidence: ${detection.confidence}
          Expression: ${detection.dominantExpression}
          
          This is an automated security alert. Please check your surveillance system.
        `;

        await this.sendEmail(
          email,
          subject,
          emailMessage,
          detection.contextImage
        );
      }

      return true;
    } catch (error) {
      console.error("Notification error:", error);
      return false;
    }
  },
};
