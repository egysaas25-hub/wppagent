import db from '../config/database';

export interface Contact {
  id: number;
  session_name: string;
  contact_id: string;
  name: string | null;
  phone: string | null;
  is_group: boolean;
  is_new: boolean;
  tags: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContactDTO {
  sessionName: string;
  contactId: string;
  name?: string;
  phone?: string;
  isGroup?: boolean;
}

class ContactModel {
  /**
   * Create or update contact
   */
  static upsert(data: CreateContactDTO): Contact {
    const { sessionName, contactId, name, phone, isGroup = false } = data;

    // Check if exists
    const existing = this.findByContactId(sessionName, contactId);

    if (existing) {
      // Update
      db.prepare(`
        UPDATE contacts
        SET name = ?, phone = ?, is_new = 0, updated_at = CURRENT_TIMESTAMP
        WHERE session_name = ? AND contact_id = ?
      `).run(name || existing.name, phone || existing.phone, sessionName, contactId);
    } else {
      // Insert
      db.prepare(`
        INSERT INTO contacts (session_name, contact_id, name, phone, is_group)
        VALUES (?, ?, ?, ?, ?)
      `).run(sessionName, contactId, name, phone, isGroup ? 1 : 0);
    }

    return this.findByContactId(sessionName, contactId)!;
  }

  /**
   * Find contact by contact ID
   */
  static findByContactId(sessionName: string, contactId: string): Contact | undefined {
    const contact = db.prepare(`
      SELECT * FROM contacts
      WHERE session_name = ? AND contact_id = ?
    `).get(sessionName, contactId) as any;

    if (contact) {
      contact.is_group = Boolean(contact.is_group);
      contact.is_new = Boolean(contact.is_new);
    }

    return contact as Contact | undefined;
  }

  /**
   * Get all contacts for a session
   */
  static findBySession(sessionName: string, options: {
    page?: number;
    limit?: number;
    isNew?: boolean;
  } = {}): { contacts: Contact[]; total: number } {
    const { page = 1, limit = 50, isNew } = options;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM contacts WHERE session_name = ?';
    const params: any[] = [sessionName];

    if (isNew !== undefined) {
      query += ' AND is_new = ?';
      params.push(isNew ? 1 : 0);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const contacts = db.prepare(query).all(...params) as any[];

    contacts.forEach(c => {
      c.is_group = Boolean(c.is_group);
      c.is_new = Boolean(c.is_new);
    });

    // Get total
    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE session_name = ?';
    const countParams: any[] = [sessionName];

    if (isNew !== undefined) {
      countQuery += ' AND is_new = ?';
      countParams.push(isNew ? 1 : 0);
    }

    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return { contacts: contacts as Contact[], total };
  }

  /**
   * Update contact tags
   */
  static updateTags(sessionName: string, contactId: string, tags: string[]): Contact | undefined {
    db.prepare(`
      UPDATE contacts
      SET tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND contact_id = ?
    `).run(JSON.stringify(tags), sessionName, contactId);

    return this.findByContactId(sessionName, contactId);
  }

  /**
   * Update contact notes
   */
  static updateNotes(sessionName: string, contactId: string, notes: string): Contact | undefined {
    db.prepare(`
      UPDATE contacts
      SET notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND contact_id = ?
    `).run(notes, sessionName, contactId);

    return this.findByContactId(sessionName, contactId);
  }

  /**
   * Mark contact as not new
   */
  static markAsRead(sessionName: string, contactId: string): Contact | undefined {
    db.prepare(`
      UPDATE contacts
      SET is_new = 0, updated_at = CURRENT_TIMESTAMP
      WHERE session_name = ? AND contact_id = ?
    `).run(sessionName, contactId);

    return this.findByContactId(sessionName, contactId);
  }
}

export default ContactModel;