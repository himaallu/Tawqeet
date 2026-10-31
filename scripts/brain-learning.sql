-- Idempotent, non-destructive companion to the Drizzle schema.
-- Install explicitly during schema migration, never as an application-startup migration.
CREATE OR REPLACE FUNCTION tawqeet_capture_reply_learning()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reply_class IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.reply_class IS NOT DISTINCT FROM NEW.reply_class THEN
    RETURN NEW;
  END IF;
  INSERT INTO brain_entries (agency_id, client_id, kind, content, meta)
  SELECT NEW.agency_id, l.client_id, 'learning',
    jsonb_build_object(
      'signal_key', COALESCE(p.signal_key, signal.definition_key),
      'play_id', d.play_id,
      'persona', COALESCE(p.persona, l.title),
      'vertical', COALESCE(c.vertical, p.vertical, ''),
      'language', d.language,
      'subject', d.subject,
      'score', d.score,
      'reply_class', NEW.reply_class
    )::text,
    jsonb_build_object(
      'signal_key', COALESCE(p.signal_key, signal.definition_key),
      'play_id', d.play_id,
      'persona', COALESCE(p.persona, l.title),
      'vertical', COALESCE(c.vertical, p.vertical, ''),
      'language', d.language,
      'subject', d.subject,
      'score', d.score,
      'reply_class', NEW.reply_class,
      'send_id', NEW.id
    )
  FROM drafts d
  JOIN leads l ON l.id = d.lead_id AND l.agency_id = NEW.agency_id
  JOIN companies c ON c.id = l.company_id AND c.agency_id = NEW.agency_id
  LEFT JOIN plays p ON p.id = d.play_id AND p.agency_id = NEW.agency_id
  LEFT JOIN LATERAL (
    SELECT s.definition_key
    FROM lead_signals ls JOIN signals s ON s.id = ls.signal_id AND s.agency_id = NEW.agency_id
    WHERE ls.lead_id = l.id AND ls.agency_id = NEW.agency_id
    ORDER BY s.detected_at DESC, s.id DESC LIMIT 1
  ) signal ON true
  WHERE d.id = NEW.draft_id AND d.agency_id = NEW.agency_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tawqeet_reply_learning' AND tgrelid = 'sends'::regclass) THEN
    CREATE TRIGGER tawqeet_reply_learning AFTER INSERT OR UPDATE OF reply_class ON sends
      FOR EACH ROW EXECUTE FUNCTION tawqeet_capture_reply_learning();
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS brain_learning_vertical_idx
  ON brain_entries (agency_id, client_id, lower(meta->>'vertical'), created_at DESC)
  WHERE kind = 'learning';
