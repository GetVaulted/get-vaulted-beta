-- Direct Agora live video: a new stream provider value. Additive; nothing changes until an admin enables it.
ALTER TYPE "LiveStreamProvider" ADD VALUE IF NOT EXISTS 'agora_rtc';
