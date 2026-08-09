alter type public.processing_run_status add value if not exists 'CANCELLING';
alter type public.processing_run_status add value if not exists 'CANCELLED';
alter type public.episode_processing_status add value if not exists 'CANCELLED';
