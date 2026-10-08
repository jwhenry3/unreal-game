import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.service';
import { CharactersService } from '../characters/characters.service';
import { GameCharacter } from '../characters/entities/game-character.entity';
import { InternalSendMailDto } from '../internal/dto/internal-send-mail.dto';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InventoryService } from '../inventory/inventory.service';
import { SendMailDto } from './dto/send-mail.dto';
import { MailAttachment } from './entities/mail-attachment.entity';
import { MailMessage } from './entities/mail-message.entity';

@Injectable()
export class MailService {
  constructor(
    @InjectRepository(MailMessage)
    private readonly messages: Repository<MailMessage>,
    @InjectRepository(MailAttachment)
    private readonly attachments: Repository<MailAttachment>,
    private readonly characters: CharactersService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService,
  ) {}

  async list(
    characterId: string,
    user: AuthenticatedUser,
    box: 'inbox' | 'sent' = 'inbox',
  ): Promise<MailMessage[]> {
    await this.characters.getOwned(characterId, user.id);
    const messages = await this.messages.find({
      where:
        box === 'sent'
          ? { sender: { id: characterId } }
          : { recipient: { id: characterId } },
      relations: {
        sender: true,
        recipient: true,
        attachments: { inventoryItem: true },
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return messages.map((mail) => this.publicMail(mail));
  }

  async send(
    senderCharacterId: string,
    user: AuthenticatedUser,
    dto: SendMailDto,
  ): Promise<MailMessage> {
    const sender = await this.characters.getOwned(senderCharacterId, user.id);
    const recipient = await this.resolveRecipient(dto, sender.realm);
    if (recipient.id === sender.id) {
      throw new BadRequestException('Characters cannot send mail to themselves.');
    }

    return this.messages.manager.transaction(async (manager) => {
      const attachments = await this.reservePlayerAttachments(
        manager,
        sender,
        dto,
      );
      const mail = manager.create(MailMessage, {
        sender,
        recipient,
        subject: dto.subject,
        body: dto.body,
        isRead: false,
        claimedAt: null,
        expiresAt: this.expirationDate(dto.expiresInHours),
        attachments,
      });
      return this.publicMail(await manager.save(mail));
    });
  }

  async sendInternal(dto: InternalSendMailDto): Promise<MailMessage> {
    const recipient = await this.characters.getById(dto.recipientCharacterId);
    const sender = dto.senderCharacterId
      ? await this.characters.getById(dto.senderCharacterId)
      : null;

    const attachments = (dto.attachments ?? []).map((attachment) => ({
      attachmentType: attachment.type,
      itemKey: attachment.type === 'item' ? attachment.itemKey ?? null : null,
      quantity: attachment.type === 'item' ? attachment.quantity ?? 1 : 0,
      currency: attachment.type === 'currency' ? attachment.currency ?? 0 : 0,
      inventoryItem: null,
      durability: attachment.durability ?? null,
      metadata: attachment.metadata ?? null,
      claimedAt: null,
    }));

    return this.messages.save(
      this.messages.create({
        sender,
        recipient,
        subject: dto.subject,
        body: dto.body,
        isRead: false,
        claimedAt: null,
        expiresAt: this.expirationDate(dto.expiresInHours),
        attachments,
      }),
    );
  }

  async get(
    characterId: string,
    mailId: string,
    user: AuthenticatedUser,
  ): Promise<MailMessage> {
    await this.characters.getOwned(characterId, user.id);
    const mail = await this.messages.findOne({
      where: [
        { id: mailId, recipient: { id: characterId } },
        { id: mailId, sender: { id: characterId } },
      ],
      relations: {
        sender: true,
        recipient: true,
        attachments: { inventoryItem: true },
      },
    });

    if (!mail) {
      throw new NotFoundException('Mail was not found.');
    }

    return this.publicMail(mail);
  }

  async markRead(
    characterId: string,
    mailId: string,
    user: AuthenticatedUser,
  ): Promise<MailMessage> {
    const mail = await this.get(characterId, mailId, user);
    if (mail.recipient.id !== characterId) {
      throw new BadRequestException('Only the recipient can mark mail as read.');
    }

    mail.isRead = true;
    return this.publicMail(await this.messages.save(mail));
  }

  async claimAttachments(
    characterId: string,
    mailId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true; items: unknown[] }> {
    await this.characters.getOwned(characterId, user.id);

    return this.messages.manager.transaction(async (manager) => {
      const mail = await this.getMailForRecipient(manager, characterId, mailId);
      if (mail.expiresAt && mail.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Mail has expired.');
      }
      if (mail.claimedAt) {
        return { success: true as const, items: [] };
      }

      const recipient = await this.getCharacter(manager, characterId);
      const now = new Date();
      const claimedItems: unknown[] = [];
      let currencyGranted = 0;

      for (const attachment of mail.attachments) {
        if (attachment.claimedAt) {
          continue;
        }

        if (attachment.attachmentType === 'currency') {
          currencyGranted += attachment.currency;
        } else if (attachment.inventoryItem) {
          attachment.inventoryItem.character = recipient;
          attachment.inventoryItem.container = 'inventory';
          attachment.inventoryItem.slotIndex = null;
          claimedItems.push(
            await manager.getRepository(InventoryItem).save(attachment.inventoryItem),
          );
        } else if (attachment.itemKey) {
          claimedItems.push(
            await this.inventory.addForCharacter(
              recipient,
              {
                itemKey: attachment.itemKey,
                quantity: attachment.quantity,
                container: 'inventory',
                durability: attachment.durability ?? undefined,
                metadata: attachment.metadata ?? undefined,
              },
              manager,
            ),
          );
        }

        attachment.claimedAt = now;
        await manager.getRepository(MailAttachment).save(attachment);
      }

      if (currencyGranted > 0) {
        recipient.currency += currencyGranted;
        await manager.getRepository(GameCharacter).save(recipient);
      }

      mail.claimedAt = now;
      mail.isRead = true;
      await manager.getRepository(MailMessage).save(mail);
      return { success: true as const, items: claimedItems };
    });
  }

  async remove(
    characterId: string,
    mailId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    await this.get(characterId, mailId, user);

    await this.messages.manager.transaction(async (manager) => {
      const mail = await manager.findOne(MailMessage, {
        where: { id: mailId },
        relations: {
          sender: true,
          recipient: true,
          attachments: { inventoryItem: true },
        },
      });
      if (!mail) {
        throw new NotFoundException('Mail was not found.');
      }

      for (const attachment of mail.attachments) {
        if (attachment.claimedAt || !attachment.inventoryItem || !mail.sender) {
          continue;
        }
        attachment.inventoryItem.character = mail.sender;
        attachment.inventoryItem.container = 'inventory';
        attachment.inventoryItem.slotIndex = null;
        await manager.getRepository(InventoryItem).save(attachment.inventoryItem);
      }

      await manager.getRepository(MailMessage).remove(mail);
    });
    return { success: true };
  }

  private async reservePlayerAttachments(
    manager: EntityManager,
    sender: GameCharacter,
    dto: SendMailDto,
  ): Promise<MailAttachment[]> {
    const itemIds = [...new Set((dto.attachments ?? []).map((item) => item.inventoryItemId))];
    if (itemIds.length !== (dto.attachments ?? []).length) {
      throw new BadRequestException('The same inventory item cannot be attached twice.');
    }
    if (itemIds.length === 0) {
      return [];
    }

    const items = await manager.find(InventoryItem, {
      where: { id: In(itemIds), character: { id: sender.id } },
      relations: { character: true },
    });
    const itemsById = new Map(items.map((item) => [item.id, item]));

    const attachments: MailAttachment[] = [];
    for (const itemId of itemIds) {
      const item = itemsById.get(itemId);
      if (!item) {
        throw new NotFoundException('One or more inventory items were not found.');
      }
      if (item.container !== 'inventory' || item.isBound) {
        throw new BadRequestException(
          'Only unbound inventory items can be attached to mail.',
        );
      }

      item.container = 'mail';
      item.slotIndex = null;
      await manager.getRepository(InventoryItem).save(item);
      attachments.push(
        manager.create(MailAttachment, {
          attachmentType: 'item',
          itemKey: item.itemKey,
          quantity: item.quantity,
          currency: 0,
          inventoryItem: item,
          durability: item.durability,
          metadata: item.metadata,
          claimedAt: null,
        }),
      );
    }

    return attachments;
  }

  private async getMailForRecipient(
    manager: EntityManager,
    characterId: string,
    mailId: string,
  ): Promise<MailMessage> {
    const mail = await manager.findOne(MailMessage, {
      where: { id: mailId, recipient: { id: characterId } },
      relations: {
        sender: true,
        recipient: true,
        attachments: { inventoryItem: true },
      },
    });
    if (!mail) {
      throw new NotFoundException('Mail was not found.');
    }
    return mail;
  }

  private async getCharacter(
    manager: EntityManager,
    characterId: string,
  ): Promise<GameCharacter> {
    const character = await manager.findOne(GameCharacter, {
      where: { id: characterId, isDeleted: false },
    });
    if (!character) {
      throw new NotFoundException('Character was not found.');
    }
    return character;
  }

  private async resolveRecipient(
    dto: SendMailDto,
    fallbackRealm: string,
  ): Promise<GameCharacter> {
    if (dto.recipientCharacterId) {
      return this.characters.getById(dto.recipientCharacterId);
    }
    if (!dto.recipientName) {
      throw new BadRequestException(
        'recipientCharacterId or recipientName is required.',
      );
    }

    const recipient = await this.characters.findByName(
      dto.recipientName.trim(),
      dto.recipientRealm?.trim() || fallbackRealm,
    );
    if (!recipient) {
      throw new NotFoundException('Recipient character was not found.');
    }
    return recipient;
  }

  private publicMail(mail: MailMessage): MailMessage {
    return {
      ...mail,
      sender: mail.sender ? this.publicCharacter(mail.sender) : null,
      recipient: this.publicCharacter(mail.recipient),
      attachments: mail.attachments.map((attachment) => {
        const inventoryItem = attachment.inventoryItem
          ? ({ ...attachment.inventoryItem } as Partial<InventoryItem>)
          : null;
        if (inventoryItem) {
          delete inventoryItem.character;
        }
        return { ...attachment, inventoryItem: inventoryItem as InventoryItem | null };
      }),
    };
  }

  private publicCharacter(character: GameCharacter): GameCharacter {
    return {
      id: character.id,
      name: character.name,
      realm: character.realm,
      mainJob: character.mainJob,
      subJob: character.subJob,
      jobProgress: character.jobProgress?.map((progress) => ({
        id: progress.id,
        jobKey: progress.jobKey,
        level: progress.level,
        experience: progress.experience,
        isUnlocked: progress.isUnlocked,
      })) ?? [],
    } as GameCharacter;
  }

  private expirationDate(expiresInHours?: number): Date {
    const ttl = expiresInHours ?? this.positiveInteger('MAIL_TTL_HOURS', 720);
    return new Date(Date.now() + ttl * 3_600_000);
  }

  private positiveInteger(name: string, fallback: number): number {
    const configured = Number.parseInt(this.config.get<string>(name, ''), 10);
    return Number.isInteger(configured) && configured > 0 ? configured : fallback;
  }
}
