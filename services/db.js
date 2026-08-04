import pg from 'pg';

const { Pool } = pg;

// PostgreSQL connection using connection string
// If DATABASE_URL is not provided, it will fail gracefully and skip DB logic
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Inicia o banco de dados e cria a tabela se não existir
 */
export async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('[DB] Erro Crítico: DATABASE_URL não configurada. O serviço exige PostgreSQL e não registrará os eventos.');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utmify_order_events (
        id BIGSERIAL PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL,
        payment_id VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        payload JSONB,
        response_status INTEGER,
        response_body TEXT,
        retry_count INTEGER DEFAULT 0,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(order_id, status)
      );
    `);
    console.log('[DB] Tabela utmify_order_events verificada/criada com sucesso.');
  } catch (error) {
    console.error('[DB Erro Init]', error);
  }
}

/**
 * Tenta criar ou encontrar um registro para o order_id + status atual.
 * Retorna true se puder prosseguir (inseriu novo, ou falhou antes e pode retentar).
 * Retorna false se o evento já foi processado com sucesso.
 */
export async function checkAndCreateEvent(orderId, paymentId, status, payload) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada. Impossível garantir idempotência e registrar evento no PostgreSQL.');
  }

  try {
    const checkQuery = `SELECT * FROM utmify_order_events WHERE order_id = $1 AND status = $2`;
    const checkRes = await pool.query(checkQuery, [orderId, status]);

    if (checkRes.rows.length > 0) {
      const row = checkRes.rows[0];
      // Se sent_at está preenchido e response_status é 2xx/Sucesso, não repetir.
      if (row.sent_at && row.response_status && row.response_status >= 200 && row.response_status < 300) {
        return { shouldProcess: false, eventId: row.id, retryCount: row.retry_count };
      }
      
      // Se for falha permanente (ex: 400), a gente não retenta infinito se quisermos ignorar.
      // A instrução diz: "Para erro 400: não repetir infinitamente". 
      // Mas se não tiver sent_at com sucesso ou for falha temporária, permitimos tentar de novo.
      return { shouldProcess: true, eventId: row.id, retryCount: row.retry_count };
    } else {
      // Inserir novo registro
      const insertQuery = `
        INSERT INTO utmify_order_events (order_id, payment_id, status, payload)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;
      const insertRes = await pool.query(insertQuery, [orderId, paymentId || null, status, payload]);
      return { shouldProcess: true, eventId: insertRes.rows[0].id, retryCount: 0 };
    }
  } catch (error) {
    // Tratar conflito de chave única caso tenha concorrência exata
    if (error.code === '23505') {
       console.log(`[DB] Concorrência detectada para ${orderId} - ${status}`);
       return { shouldProcess: false };
    }
    console.error('[DB Erro checkAndCreateEvent]', error);
    return { shouldProcess: true }; // Fallback permissivo para tentar enviar à UTMify
  }
}

/**
 * Atualiza o evento após tentativa de envio (Sucesso ou Falha permanente)
 */
export async function updateEventResult(eventId, responseStatus, responseBodyStr, isSuccess) {
  if (!process.env.DATABASE_URL || !eventId) throw new Error('DATABASE_URL ausente ou eventId inválido.');

  try {
    const query = `
      UPDATE utmify_order_events
      SET response_status = $1,
          response_body = $2,
          sent_at = $3
      WHERE id = $4
    `;
    const sentAt = isSuccess ? new Date() : null; // Somente marcar sent_at se sucesso, ou podemos marcar falha também. A instrução diz "depois de sucesso, preencher sent_at e response_status". 
    // Em erro 4xx, também queremos salvar o status e o body, mas não sent_at.
    await pool.query(query, [responseStatus, responseBodyStr, sentAt, eventId]);
  } catch (error) {
    console.error('[DB Erro updateEventResult]', error);
  }
}

/**
 * Incrementa o contador de retentativa para falhas temporárias.
 */
export async function incrementRetryCount(eventId, responseStatus, responseBodyStr) {
  if (!process.env.DATABASE_URL || !eventId) throw new Error('DATABASE_URL ausente ou eventId inválido.');

  try {
    const query = `
      UPDATE utmify_order_events
      SET retry_count = retry_count + 1,
          response_status = $1,
          response_body = $2
      WHERE id = $3
    `;
    await pool.query(query, [responseStatus, responseBodyStr, eventId]);
  } catch (error) {
    console.error('[DB Erro incrementRetryCount]', error);
  }
}
