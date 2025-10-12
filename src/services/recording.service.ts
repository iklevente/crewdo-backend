import { Injectable, Logger, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';

export interface Recording {
  id: string;
  callId: string;
  filename: string;
  filePath: string;
  size: number;
  duration: number; // in seconds
  startTime: Date;
  endTime: Date;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  url?: string;
  metadata?: {
    format: string;
    codec: string;
    resolution?: string;
    bitrate?: number;
  };
}

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private readonly recordingsPath: string;
  private readonly publicUrl: string;
  private recordings = new Map<string, Recording>();

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {
    this.recordingsPath =
      this.configService.get('RECORDINGS_PATH') || './recordings';
    this.publicUrl =
      this.configService.get('PUBLIC_URL') || 'http://localhost:3000';
    void this.ensureRecordingsDirectory();
  }

  private async ensureRecordingsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.recordingsPath, { recursive: true });
      this.logger.log(
        `Recordings directory ensured at: ${this.recordingsPath}`,
      );
    } catch (error) {
      this.logger.error(`Failed to create recordings directory: ${error}`);
    }
  }

  /**
   * Start a new recording
   */
  startRecording(
    callId: string,
    options: {
      format?: string;
      quality?: 'low' | 'medium' | 'high';
      audioOnly?: boolean;
    } = {},
  ): Recording {
    const recordingId = `rec_${callId}_${Date.now()}`;
    const filename = `${recordingId}.webm`;
    const filePath = path.join(this.recordingsPath, filename);

    const recording: Recording = {
      id: recordingId,
      callId,
      filename,
      filePath,
      size: 0,
      duration: 0,
      startTime: new Date(),
      endTime: new Date(),
      status: 'recording',
      metadata: {
        format: options.format || 'webm',
        codec: options.audioOnly ? 'opus' : 'vp8+opus',
        bitrate: this.getBitrateForQuality(options.quality || 'medium'),
      },
    };

    this.recordings.set(recordingId, recording);
    this.logger.log(`Started recording ${recordingId} for call ${callId}`);

    // In production, this would:
    // 1. Configure Janus VideoRoom recording
    // 2. Set up file recording pipeline
    // 3. Store recording metadata in database

    return recording;
  }

  /**
   * Stop a recording
   */
  stopRecording(recordingId: string): Promise<Recording> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    recording.endTime = new Date();
    recording.duration = Math.floor(
      (recording.endTime.getTime() - recording.startTime.getTime()) / 1000,
    );
    recording.status = 'processing';

    this.logger.log(
      `Stopped recording ${recordingId}, duration: ${recording.duration}s`,
    );

    // Simulate file processing
    setTimeout(() => {
      void this.processRecording(recordingId);
    }, 2000);

    return Promise.resolve(recording);
  }

  /**
   * Process recording (convert, compress, upload)
   */
  private processRecording(recordingId: string): Promise<void> {
    const recording = this.recordings.get(recordingId);
    if (!recording) return Promise.resolve();

    try {
      this.logger.log(`Processing recording ${recordingId}`);

      // Simulate file processing
      recording.size = Math.floor(Math.random() * 100 * 1024 * 1024); // Random size up to 100MB
      recording.url = `${this.publicUrl}/api/recordings/${recordingId}`;
      recording.status = 'completed';

      // In production, this would:
      // 1. Convert video format if needed (FFmpeg)
      // 2. Generate thumbnails/previews
      // 3. Upload to cloud storage (S3, MinIO, etc.)
      // 4. Update database with final file info
      // 5. Send notification to participants

      this.logger.log(`Recording ${recordingId} processing completed`);
      return Promise.resolve();
    } catch (error) {
      this.logger.error(`Failed to process recording ${recordingId}: ${error}`);
      recording.status = 'failed';
      return Promise.resolve();
    }
  }

  /**
   * Get recording by ID
   */
  getRecording(recordingId: string): Promise<Recording | null> {
    return Promise.resolve(this.recordings.get(recordingId) || null);
  }

  /**
   * Get recordings for a call
   */
  getRecordingsForCall(callId: string): Promise<Recording[]> {
    return Promise.resolve(
      Array.from(this.recordings.values()).filter((r) => r.callId === callId),
    );
  }

  /**
   * Delete a recording
   */
  async deleteRecording(recordingId: string): Promise<void> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    try {
      // Delete file
      await fs.unlink(recording.filePath);

      // Remove from memory (in production, remove from database)
      this.recordings.delete(recordingId);

      this.logger.log(`Deleted recording ${recordingId}`);
    } catch (error) {
      this.logger.error(`Failed to delete recording ${recordingId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get download URL for recording
   */
  getDownloadUrl(recordingId: string): string {
    const recording = this.recordings.get(recordingId);
    if (!recording || recording.status !== 'completed') {
      throw new Error('Recording not available for download');
    }

    return `${this.publicUrl}/api/recordings/${recordingId}/download`;
  }

  /**
   * Get recording stream for playback
   */
  async getRecordingStream(recordingId: string): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    contentType: string;
  }> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    if (recording.status !== 'completed') {
      throw new Error('Recording is not ready for streaming');
    }

    try {
      // Check if file exists
      await fs.access(recording.filePath);

      // Get file stats
      const stats = await fs.stat(recording.filePath);

      // Create read stream
      const stream = createReadStream(recording.filePath);

      // Determine content type based on file extension
      const contentType = this.getContentType(recording.filename);

      return {
        stream,
        size: stats.size,
        contentType,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create stream for recording ${recordingId}: ${error}`,
      );
      throw new Error('Recording file not accessible');
    }
  }

  /**
   * Get recordings list with pagination
   */
  async getRecordings(
    options: {
      callId?: string;
      status?: Recording['status'];
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ recordings: Recording[]; total: number }> {
    let recordings = Array.from(this.recordings.values());

    // Filter by callId
    if (options.callId) {
      recordings = recordings.filter((r) => r.callId === options.callId);
    }

    // Filter by status
    if (options.status) {
      recordings = recordings.filter((r) => r.status === options.status);
    }

    // Sort by start time (newest first)
    recordings.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Pagination
    const total = recordings.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    recordings = recordings.slice(offset, offset + limit);

    return Promise.resolve({ recordings, total });
  }

  private getBitrateForQuality(quality: 'low' | 'medium' | 'high'): number {
    switch (quality) {
      case 'low':
        return 500000; // 500 kbps
      case 'medium':
        return 1000000; // 1 Mbps
      case 'high':
        return 2000000; // 2 Mbps
      default:
        return 1000000;
    }
  }

  private getContentType(filename: string): string {
    const extension = path.extname(filename).toLowerCase();
    switch (extension) {
      case '.webm':
        return 'video/webm';
      case '.mp4':
        return 'video/mp4';
      case '.avi':
        return 'video/x-msvideo';
      case '.mov':
        return 'video/quicktime';
      case '.wav':
        return 'audio/wav';
      case '.mp3':
        return 'audio/mpeg';
      case '.ogg':
        return 'audio/ogg';
      default:
        return 'application/octet-stream';
    }
  }
}
