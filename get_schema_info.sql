CREATE OR REPLACE FUNCTION public.get_schema_info()
RETURNS JSONB AS $$
DECLARE
    v_columns JSONB;
    v_triggers JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name))
    INTO v_columns
    FROM information_schema.columns
    WHERE table_name IN ('payments', 'transactions', 'notifications', 'profiles');

    SELECT jsonb_agg(jsonb_build_object('trigger', trigger_name, 'event_object_table', event_object_table, 'action_statement', action_statement))
    INTO v_triggers
    FROM information_schema.triggers
    WHERE event_object_table IN ('payments', 'transactions', 'notifications', 'profiles');

    RETURN jsonb_build_object('columns', v_columns, 'triggers', v_triggers);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
