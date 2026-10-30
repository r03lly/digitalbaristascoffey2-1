CREATE TABLE public.barista_names (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barista_names TO authenticated;
GRANT ALL ON public.barista_names TO service_role;
ALTER TABLE public.barista_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read barista names" ON public.barista_names FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'barista'));
CREATE POLICY "admin manage barista names" ON public.barista_names FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX barista_names_unique_name ON public.barista_names (lower(btrim(name)));
ALTER TABLE public.attendance ADD COLUMN barista_name_id uuid REFERENCES public.barista_names(id);
CREATE UNIQUE INDEX attendance_named_daily ON public.attendance (barista_name_id, work_date) WHERE barista_name_id IS NOT NULL;
CREATE FUNCTION public.validate_named_attendance() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE selected_name text;
BEGIN
 IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
  SELECT name INTO selected_name FROM public.barista_names WHERE id = NEW.barista_name_id AND active;
  IF selected_name IS NULL THEN RAISE EXCEPTION 'Pilih nama barista aktif yang dibuat admin.'; END IF;
  NEW.staff_name := selected_name;
 END IF;
 IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
  IF NEW.barista_name_id IS DISTINCT FROM OLD.barista_name_id OR NEW.staff_name IS DISTINCT FROM OLD.staff_name OR NEW.work_date IS DISTINCT FROM OLD.work_date OR NEW.check_in IS DISTINCT FROM OLD.check_in OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
   RAISE EXCEPTION 'Identitas dan jam masuk presensi tidak dapat diubah.';
  END IF;
 END IF;
 IF NEW.check_out IS NOT NULL AND NEW.check_out < NEW.check_in THEN RAISE EXCEPTION 'Jam pulang tidak boleh sebelum jam masuk.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_named_attendance BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.validate_named_attendance();