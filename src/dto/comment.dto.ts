import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'This task is completed and ready for review.' })
  @IsString()
  content: string;

  @ApiProperty({ example: 'task-uuid-here' })
  @IsUUID()
  taskId: string;
}

export class UpdateCommentDto {
  @ApiProperty({ example: 'Updated comment content.' })
  @IsString()
  content: string;
}

export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  isEdited: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePicture?: string;
  };

  @ApiProperty()
  task: {
    id: string;
    title: string;
  };
}
