import { Operation, OperationType } from '../types/undoRedo';
import { operationHistoryManager } from './operationHistory';
import { Chain } from '../types';
import { RSIPNode } from '../types';

// 生成唯一ID
const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// 记录链条创建操作
export const recordChainCreate = (chain: Chain): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'CREATE_CHAIN',
    timestamp: new Date(),
    description: `创建链条: ${chain.name}`,
    previousState: null,
    nextState: JSON.parse(JSON.stringify(chain)),
    entityIds: [chain.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录链条更新操作
export const recordChainUpdate = (previousChain: Chain, updatedChain: Chain): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'UPDATE_CHAIN',
    timestamp: new Date(),
    description: `更新链条: ${updatedChain.name}`,
    previousState: JSON.parse(JSON.stringify(previousChain)),
    nextState: JSON.parse(JSON.stringify(updatedChain)),
    entityIds: [updatedChain.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录链条删除操作
export const recordChainDelete = (chain: Chain): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'DELETE_CHAIN',
    timestamp: new Date(),
    description: `删除链条: ${chain.name}`,
    previousState: JSON.parse(JSON.stringify(chain)),
    nextState: null,
    entityIds: [chain.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录链条恢复操作
export const recordChainRestore = (chain: Chain): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'RESTORE_CHAIN',
    timestamp: new Date(),
    description: `恢复链条: ${chain.name}`,
    previousState: null,
    nextState: JSON.parse(JSON.stringify(chain)),
    entityIds: [chain.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录RSIP节点创建操作
export const recordRSIPNodeCreate = (node: RSIPNode): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'CREATE_RSIP_NODE',
    timestamp: new Date(),
    description: `创建RSIP节点: ${node.title}`,
    previousState: null,
    nextState: JSON.parse(JSON.stringify(node)),
    entityIds: [node.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录RSIP节点更新操作
export const recordRSIPNodeUpdate = (previousNode: RSIPNode, updatedNode: RSIPNode): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'UPDATE_RSIP_NODE',
    timestamp: new Date(),
    description: `更新RSIP节点: ${updatedNode.title}`,
    previousState: JSON.parse(JSON.stringify(previousNode)),
    nextState: JSON.parse(JSON.stringify(updatedNode)),
    entityIds: [updatedNode.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录RSIP节点删除操作
export const recordRSIPNodeDelete = (node: RSIPNode): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'DELETE_RSIP_NODE',
    timestamp: new Date(),
    description: `删除RSIP节点: ${node.title}`,
    previousState: JSON.parse(JSON.stringify(node)),
    nextState: null,
    entityIds: [node.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录会话完成操作
export const recordSessionComplete = (chain: Chain, sessionDuration: number): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'COMPLETE_SESSION',
    timestamp: new Date(),
    description: `完成专注会话: ${chain.name}`,
    previousState: JSON.parse(JSON.stringify(chain)),
    nextState: JSON.parse(JSON.stringify({
      ...chain,
      totalCompletions: chain.totalCompletions + 1,
      lastCompletedAt: new Date()
    })),
    entityIds: [chain.id]
  };

  operationHistoryManager.addOperation(operation);
};

// 记录会话中断操作
export const recordSessionInterrupt = (chain: Chain, reason?: string): void => {
  const operation: Operation = {
    id: generateId(),
    type: 'INTERRUPT_SESSION',
    timestamp: new Date(),
    description: `中断专注会话: ${chain.name}${reason ? ` (${reason})` : ''}`,
    previousState: JSON.parse(JSON.stringify(chain)),
    nextState: JSON.parse(JSON.stringify({
      ...chain,
      totalFailures: chain.totalFailures + 1
    })),
    entityIds: [chain.id]
  };

  operationHistoryManager.addOperation(operation);
};
