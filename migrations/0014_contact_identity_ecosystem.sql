DROP INDEX IF EXISTS contacts_accountid_normalizedname_unique;

CREATE INDEX IF NOT EXISTS contacts_account_normalized_name_idx
  ON contacts(account_id, normalized_name);

CREATE INDEX IF NOT EXISTS att_conversations_account_contact_idx
  ON att_conversations(account_id, contact_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS campaign_recipients_account_contact_idx
  ON campaign_recipients(account_id, contact_id, created_at DESC);

UPDATE att_conversations conversation
SET contact_id = match.contact_id
FROM (
  SELECT conversation_match.id, min(contact_match.id) AS contact_id
  FROM att_conversations conversation_match
  JOIN contacts contact_match ON contact_match.account_id = conversation_match.account_id
   AND (
     (nullif(lower(trim(conversation_match.contact_email)), '') IS NOT NULL
       AND lower(trim(contact_match.email)) = lower(trim(conversation_match.contact_email)))
     OR
     (nullif(regexp_replace(coalesce(conversation_match.contact_phone, conversation_match.external_contact_id, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
       AND regexp_replace(regexp_replace(coalesce(contact_match.phone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') =
           regexp_replace(regexp_replace(coalesce(conversation_match.contact_phone, conversation_match.external_contact_id, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', ''))
   )
  WHERE conversation_match.contact_id IS NULL
  GROUP BY conversation_match.id
  HAVING count(contact_match.id) = 1
) match
WHERE conversation.id = match.id;

UPDATE campaign_recipients recipient
SET contact_id = match.contact_id
FROM (
  SELECT recipient_match.id, min(contact_match.id) AS contact_id
  FROM campaign_recipients recipient_match
  JOIN contacts contact_match ON contact_match.account_id = recipient_match.account_id
   AND (
     (recipient_match.channel = 'email' AND lower(trim(contact_match.email)) = lower(trim(recipient_match.recipient)))
     OR
     (recipient_match.channel <> 'email'
       AND regexp_replace(regexp_replace(coalesce(contact_match.phone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') =
           regexp_replace(regexp_replace(coalesce(recipient_match.recipient, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', ''))
   )
  WHERE recipient_match.contact_id IS NULL
  GROUP BY recipient_match.id
  HAVING count(contact_match.id) = 1
) match
WHERE recipient.id = match.id;

UPDATE petition_signatures signature
SET contact_id = match.contact_id
FROM (
  SELECT signature_match.id, min(contact_match.id) AS contact_id
  FROM petition_signatures signature_match
  JOIN petitions petition_match ON petition_match.id = signature_match.petition_id
  JOIN contacts contact_match ON contact_match.account_id = petition_match.account_id
   AND (
     (nullif(lower(trim(signature_match.email)), '') IS NOT NULL AND lower(trim(contact_match.email)) = lower(trim(signature_match.email)))
     OR
     (nullif(regexp_replace(coalesce(signature_match.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
       AND regexp_replace(regexp_replace(coalesce(contact_match.phone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', '') =
           regexp_replace(regexp_replace(coalesce(signature_match.phone, ''), '[^0-9]', '', 'g'), '^55(?=[0-9]{10,11}$)', ''))
   )
  WHERE signature_match.contact_id IS NULL
  GROUP BY signature_match.id
  HAVING count(contact_match.id) = 1
) match
WHERE signature.id = match.id;
