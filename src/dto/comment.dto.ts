import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsUUID()
  taskId: string;
}

export class UpdateCommentDto {
  @ApiProperty()
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
