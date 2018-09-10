import React from 'react';
import PropTypes from 'prop-types';
import { compose, graphql } from 'react-apollo/index';
import update from 'immutability-helper';

import translate from '../../../i18n';
import MESSAGES_QUERY from '../graphql/MessagesQuery.graphql';
import ADD_MESSAGE from '../graphql/AddMessage.graphql';
import DELETE_MESSAGE from '../graphql/DeleteMessage.graphql';
import EDIT_MESSAGE from '../graphql/EditMessage.graphql';
import { withUser } from '../../user/containers/AuthBase';
import withUuid from './WithUuid';
import ChatOperations from './ChatOperations';
import messageImage from './MessageImage';
import messagesFormatter from './MessagesFormatter';
import chatConfig from '../../../../../../config/chat';
import withSubscription from './WithSubscription';

function AddMessage(prev, node) {
  // ignore if duplicate
  if (prev.messages.edges.some(edge => node.id === edge.node.id)) {
    return prev;
  }

  const filteredEdges = prev.messages.edges.filter(edge => edge.node.id !== null);
  const edge = {
    cursor: 0,
    node,
    __typename: 'MessageEdges'
  };

  const increment = edge.node.id ? 1 : 0;
  const updatedEdges = [...filteredEdges, edge].map((edge, i) => ({ ...edge, cursor: filteredEdges.length - i }));

  return update(prev, {
    messages: {
      totalCount: {
        $set: prev.messages.totalCount + increment
      },
      edges: {
        $set: updatedEdges
      },
      pageInfo: {
        endCursor: {
          $set: prev.messages.pageInfo.endCursor + increment
        }
      }
    }
  });
}

function DeleteMessage(prev, id) {
  const index = prev.messages.edges.findIndex(x => x.node.id === id);

  // ignore if not found
  if (index < 0) {
    return prev;
  }

  const updatedEdges = prev.messages.edges
    .filter((edge, i) => i !== index)
    .map((edge, cursor) => ({ ...edge, cursor }));

  return update(prev, {
    messages: {
      totalCount: {
        $set: prev.messages.totalCount - 1
      },
      edges: {
        $set: updatedEdges
      },
      pageInfo: {
        endCursor: {
          $set: prev.messages.pageInfo.endCursor - 1
        }
      }
    }
  });
}

function EditMessage(prev, node) {
  const newEdge = {
    cursor: node.id,
    node,
    __typename: 'MessageEdges'
  };

  return update(prev, {
    messages: {
      edges: {
        $set: prev.messages.edges.map(edge => (edge.node.id === node.id ? newEdge : edge))
      }
    }
  });
}

class Chat extends React.Component {
  static propTypes = {
    loading: PropTypes.bool.isRequired,
    messages: PropTypes.object,
    loadData: PropTypes.func.isRequired
  };

  componentDidUpdate() {
    const { messagesUpdated, updateQuery } = this.props;
    if (messagesUpdated) {
      this.updateMessagesState(messagesUpdated, updateQuery);
    }
  }

  updateMessagesState = (messagesUpdated, updateQuery) => {
    const { mutation, node } = messagesUpdated;
    updateQuery(prev => {
      switch (mutation) {
        case 'CREATED':
          return AddMessage(prev, node);
        case 'DELETED':
          return DeleteMessage(prev, node.id);
        case 'UPDATED':
          return EditMessage(prev, node);
        default:
          return prev;
      }
    });
  };

  render() {
    return <ChatOperations {...this.props} />;
  }
}

export default compose(
  graphql(MESSAGES_QUERY, {
    options: () => {
      return {
        fetchPolicy: 'network-only',
        variables: { limit: chatConfig.limit, after: 0 }
      };
    },
    props: ({ data }) => {
      const { loading, error, messages, fetchMore, updateQuery } = data;
      const loadData = (after, dataDelivery) => {
        return fetchMore({
          variables: {
            after: after
          },
          updateQuery: (
            previousResult,
            {
              fetchMoreResult: {
                messages: { totalCount, edges, pageInfo }
              }
            }
          ) => {
            return {
              // By returning `cursor` here, we update the `fetchMore` function
              // to the new cursor.
              messages: {
                totalCount,
                edges: dataDelivery === 'add' ? [...edges, ...previousResult.messages.edges] : edges,
                pageInfo,
                __typename: 'Messages'
              }
            };
          }
        });
      };
      if (error) throw new Error(error);
      return { loading, messages, updateQuery, loadData };
    }
  }),
  graphql(ADD_MESSAGE, {
    props: ({ mutate }) => ({
      addMessage: async ({ text, userId, username, uuid, quotedId, attachment, quotedMessage }) => {
        mutate({
          variables: { input: { text, uuid, quotedId, attachment } },
          optimisticResponse: {
            __typename: 'Mutation',
            addMessage: {
              __typename: 'Message',
              createdAt: new Date().toISOString(),
              text,
              username,
              userId,
              uuid,
              id: null,
              quotedId,
              quotedMessage: {
                __typename: 'QuotedMessage',
                ...quotedMessage
              },
              filename: attachment ? attachment.name : null,
              path: attachment ? attachment.uri : null
            }
          }
        });
      }
    })
  }),
  graphql(DELETE_MESSAGE, {
    props: ({ mutate }) => ({
      deleteMessage: id => {
        mutate({
          variables: id,
          optimisticResponse: {
            __typename: 'Mutation',
            deleteMessage: {
              id: id,
              __typename: 'Message'
            }
          }
        });
      }
    })
  }),
  graphql(EDIT_MESSAGE, {
    props: ({ mutate }) => ({
      editMessage: ({ text, id, createdAt, userId, username, uuid, quotedId, quotedMessage }) => {
        mutate({
          variables: { input: { text, id } },
          optimisticResponse: {
            __typename: 'Mutation',
            editMessage: {
              id,
              text,
              userId,
              username,
              createdAt: createdAt.toISOString(),
              uuid,
              quotedId,
              quotedMessage: {
                __typename: 'QuotedMessage',
                ...quotedMessage
              },
              filename: null,
              path: null,
              __typename: 'Message'
            }
          }
        });
      }
    })
  }),
  translate('chat'),
  withUuid,
  withUser,
  messageImage,
  messagesFormatter,
  withSubscription
)(Chat);