// src/ChatApp.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import * as signalR from "@microsoft/signalr";
import ReactMarkdown from "react-markdown"; // Import react-markdown
import avatarImage from "./assets/avatar.png";
import infoIcon from "./assets/info.png";
import activitiesData from './data/activities.js'; // Adjust the path as needed
import hotelsData from './data/hotels.js'; // Adjust the path as needed

const ChatApp = () => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://localhost:7110";

  const { userID: urlUserID, assistantID: urlAssistantID, language: urlLanguage } = useParams();

  const chatWindowRef = useRef(null); // Ref for the chat window container

  // Use URL params directly to manage state
  const [userID] = useState(urlUserID || "");
  const [assistantID] = useState(urlAssistantID || "");
  const [threadID, setThreadID] = useState(null);
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false); // Loading state flag

  const signalRConnection = useRef(null);
  const completeMessageContent = useRef(""); // To store the complete message

  const [language, setLanguage] = useState(urlLanguage || "en"); // Default to English
  const labelTranslations = {
    en: {
      chatWindow: "Chat Window",
      adventureList: "Adventure Activities",
      cultureList: "Culture Activities",
      hotelsList: "Hotels",
      sendButton: "Send",
      textInput: "Type your message",
      sayHello: "Say Hello"
    },
    es: {
      chatWindow: "Ventana de Chat",
      adventureList: "Actividades Enfocadas en Aventura",
      cultureList: "Actividades Enfocadas en Cultura/Relajación",
      hotelsList: "Hoteles",
      sendButton: "Enviar",
      textInput: "Escribe tu mensaje",
      sayHello: "Di Hola"
    }
  };

  const [activeTooltip, setActiveTooltip] = useState(null);

  // Initialize SignalR connection
  const initializeSignalRConnection = useCallback((currentThreadID) => {
    if (signalRConnection.current) {
      // If already connected, do nothing
      return;
    }

    signalRConnection.current = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/chathub`) // Adjust this URL to your API's SignalR Hub
      .configureLogging(signalR.LogLevel.Information) // Enables logging
      .withAutomaticReconnect()
      .build();

    signalRConnection.current.start({ withCredentials: false }).then(() => {
      console.log("Connected to SignalR hub");

      // Join the chat thread group
      if (currentThreadID) {
        try {
          console.log(`Attempting to join thread with ID: ${currentThreadID}`);
          signalRConnection.current.invoke("JoinThread", currentThreadID);
        } catch (error) {
          console.error("Error joining thread:", error);
        }
      }

      // Listen for delta messages but just collect them without displaying
      signalRConnection.current.on("AssistantTyping", (deltaMessage) => {
        // Append to our complete message instead of showing incrementally
        completeMessageContent.current += deltaMessage;
      });

      // Listen for the complete assistant message
      signalRConnection.current.on("ReceiveMessage", (completeMessage) => {
        // Now add the complete message to chat
        setChatMessages((prevMessages) => [
          ...prevMessages,
          { 
            sender: "assistant", 
            text: completeMessageContent.current, 
            isComplete: true 
          }
        ]);
        
        // Reset the complete message for next response
        completeMessageContent.current = "";
        
        // Turn off loading state
        setIsLoadingResponse(false);
      });

      // Listen for the confirmation message from the server
      signalRConnection.current.on("JoinedThreadConfirmation", (message) => {
        console.log(message); // Should log the confirmation message sent from the server
      });
    }).catch((error) => {
      console.error("Error connecting to SignalR hub:", error);
    });
  }, [API_BASE_URL]);

  // Memoize the loadExistingThread function using useCallback
  const loadExistingThread = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/chat/getThread/${userID}/${assistantID}`);
      const thread = response.data;

      if (thread && thread.id) {
        console.log(`Thread found: ${thread.id}`)
        setThreadID(thread.id);

        initializeSignalRConnection(thread.id);

        if (thread.messages) {
          setChatMessages(thread.messages.map(msg => ({
            sender: msg.isFromUser ? "user" : "assistant",
            text: msg.content,
            timestamp: msg.timestamp,
            isComplete: true
          })));
        }
      }
    } catch (error) {
        console.error("Error fetching the existing thread:", error);
    }
  }, [API_BASE_URL, userID, assistantID, setThreadID, initializeSignalRConnection]);

  // useEffect to handle initialization and loading of the existing thread
  useEffect(() => {
    if (userID && assistantID) {
      loadExistingThread();
    }
  }, [userID, assistantID, loadExistingThread]);

  // Cleanup effect to stop SignalR connection when component unmounts
  useEffect(() => {
    return () => {
      if (signalRConnection.current) {
        signalRConnection.current.stop().then(() => {
          console.log("Disconnected from SignalR hub");
        });
      }
    };
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (message.trim()) {
      const newMessage = { sender: "user", text: message };
      setChatMessages([...chatMessages, newMessage]);

      const chatData = {
        threadID,
        userID,
        assistantID,
        content: message,
        isFromUser: true
      };

      setMessage("");
      setIsLoadingResponse(true); // Set loading state
      console.log(`Sending message: "${chatData.content}" on Thread: ${chatData.threadID}`);

      try {
        const response = await axios.post(`${API_BASE_URL}/api/chat/sendMessage`, chatData);
        
        if (response.status === 200) {
          console.log("Message successfully sent:", response.data);
        } else {
          console.error("Error sending message:", response.data);
          setIsLoadingResponse(false); // Reset loading state in case of error
        }
      } catch (error) {
        console.error("Error sending message:", error);
        alert("Failed to send the message. Please try again.");
        setIsLoadingResponse(false); // Reset loading state in case of error
      }
    }
  };

  const handleFirstMessage = async (e) => {
    e.preventDefault();
    const firstMessage = "Hello!";
    const newMessage = { sender: "user", text: firstMessage };
    setChatMessages([...chatMessages, newMessage]);

    const chatData = {
      threadID,
      userID,
      assistantID,
      content: firstMessage,
      isFromUser: true
    };

    setIsLoadingResponse(true); // Set loading state
    console.log(`Sending message: "${chatData.content}" on Thread: ${chatData.threadID}`);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/chat/sendMessage`, chatData);
      
      if (response.status === 200) {
        console.log("Message successfully sent:", response.data);
      } else {
        console.error("Error sending message:", response.data);
        setIsLoadingResponse(false); // Reset loading state in case of error
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send the message. Please try again.");
      setIsLoadingResponse(false); // Reset loading state in case of error
    }
  };

  const handleInfoClick = (id) => {
    setActiveTooltip(activeTooltip === id ? null : id); // Toggle tooltip visibility
  };

  // Handle language change
  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
  };

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatMessages]); // Trigger this effect whenever chatMessages changes

  return (
    <div style={styles.container}>
      <div style={styles.languageSelector}>
        <label htmlFor="language-select">Select Language:</label>
        <select
          id="language-select"
          value={language}
          onChange={handleLanguageChange}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>
      <div style={styles.activitiesContainer}>
        <ul style={styles.activitiesList}>
          <li style={{fontWeight:"bold"}}>{labelTranslations[language].adventureList}:</li>
          {activitiesData["adventure"][language].map((item) => (
            <li key={item.id} style={styles.listItem}>
              {item.title} - ${item.cost}
              <button onClick={() => handleInfoClick(item.id)} style={styles.infoButton}>
                <img src={infoIcon} width="12" height="12" alt="i"></img>
              </button>
              {activeTooltip === item.id && (
                <div style={styles.tooltip}>
                  {item.description}
                  <button onClick={() => setActiveTooltip(null)} style={styles.closeButton}>
                    ✖️
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <ul style={styles.activitiesList}>
          <li style={{fontWeight:"bold"}}>{labelTranslations[language].cultureList}:</li>
          {activitiesData["culture"][language].map((item) => (
            <li key={item.id} style={styles.listItem}>
              {item.title} - ${item.cost}
              <button onClick={() => handleInfoClick(item.id)} style={styles.infoButton}>
                <img src={infoIcon} width="12" height="12" alt="i"></img>
              </button>
              {activeTooltip === item.id && (
                <div style={styles.tooltip}>
                  {item.description}
                  <button onClick={() => setActiveTooltip(null)} style={styles.closeButton}>
                    ✖️
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div style={styles.hotelsContainer}>
        <div style={styles.hotelsTitle}>
          <h4>{labelTranslations[language].hotelsList}:</h4>
          <ul style={styles.hotelsList}>
          {hotelsData[language].map((item) => (
            <li key={item.id} style={styles.listItem}>
              {item.name} - ${item.cost}
              <button onClick={() => handleInfoClick(item.id)} style={styles.infoButton}>
                <img src={infoIcon} width="12" height="12" alt="i"></img>
              </button>
              {activeTooltip === item.id && (
                <div style={styles.tooltip}>
                  {item.description}
                  <button onClick={() => setActiveTooltip(null)} style={styles.closeButton}>
                    ✖️
                  </button>
                </div>
              )}
            </li>
          ))}
          </ul>
        </div>
      </div>
      <div style={styles.chatContainer}>
        <div style={styles.avatarContainer}>
          <img
            src={avatarImage} // Replace with your avatar image path
            alt="Assistant Avatar"
            style={styles.avatar}
          />
        </div>
      {chatMessages.length > 0 ? (
        <div style={styles.chatContent}>
          <h2>{labelTranslations[language].chatWindow}</h2>
          <div ref={chatWindowRef} style={styles.chatWindow}>
            {chatMessages.length === 0 && <p style={styles.placeholder}>{labelTranslations[language].textInput}</p>}
            {chatMessages.map((msg, index) => (
              <div key={index} style={msg.sender === "user" ? styles.userMessage : styles.assistantMessage}>
                {msg.sender === "assistant" ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown> // Render markdown using react-markdown
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {/* Simple loading indicator without text animation */}
            {isLoadingResponse && (
              <div style={styles.loadingIndicator}>
                <div style={styles.loadingDot}></div>
                <div style={styles.loadingDot}></div>
                <div style={styles.loadingDot}></div>
              </div>
            )}
          </div>
          <form onSubmit={handleSendMessage} style={styles.chatInputForm}>
            <input
              type="text"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={styles.chatInput}
            />
            <button type="submit" style={styles.sendButton}>{labelTranslations[language].sendButton}</button>
          </form>
        </div>
      ) : (
        <div style={styles.chatContent}>
          <form onSubmit={handleFirstMessage} style={styles.firstMessageForm}>
            <button type="submit" style={styles.firstMessageButton}>{labelTranslations[language].sayHello}</button>
          </form>
        </div>
      )}
      </div>
    </div>
  );
};

// Basic styles for the components
const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    flexDirection: "column",
    fontFamily: "Arial, sans-serif",
    position: "absolute",
    left: "24px",
    right: "24px"
  },
  chatContainer: {
    display: "flex",
    alignItems: "flex-end",
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.1)",
    width: "100%",
    padding: "20px 0 20px 0"
  },
  activitiesContainer: {
    display: "flex",
    justifyContent: 'space-between', // Optional, adds space between lists
    alignItems: 'flex-start',        // Aligns lists to the top
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.1)",
    width: "100%",
    marginBottom: "24px",
    padding: "20px 0 20px 0"
  },
  activitiesList: {
    listStyleType: 'none',
    padding: 0,
    margin: '0 20px',               // Adds space between lists
  },
  hotelsContainer: {
    display: "flex",
    justifyContent: 'space-between', // Optional, adds space between lists
    alignItems: 'flex-start',        // Aligns lists to the top
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0px 0px 10px rgba(0, 0, 0, 0.1)",
    width: "100%",
    marginBottom: "24px",
    padding: "0 0 20px 0"
  },
  hotelsTitle: {
    width: "100%",
    display: "flex", // Enables Flexbox
    flexDirection: "column", // Stacks h4 and ul vertically
    justifyContent: "center", // Centers both h4 and ul vertically
    alignItems: "center", // Centers them horizontally
  },
  hotelsList: {
    display: "flex", // Makes list items horizontal
    gap: "20px", // Adds spacing between list items
    listStyleType: "none", // Removes default bullet points
    padding: 0, // Removes default padding
    margin: 0, // Removes default margin
  },
  infoButton: {
    marginLeft: '8px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontSize: '1em',
  },
  tooltip: {
    position: 'absolute',
    top: '50px',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: '8px',
    padding: '8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#fff',
    width: '260px',
    textAlign: 'center',
    zIndex: 1,
    whiteSpace: 'normal',
  },
  closeButton: {
    display: 'block',
    marginTop: '8px',
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1em',
  },
  avatarContainer: {
    position: "flex",
    alignItems: "flex-end",
    left: "10px",
    marginLeft: "8px",
    marginRight: "8px",
    marginBottom: "35px",
  },
  chatContent: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  chatWindow: {
    height: "300px",
    overflowY: "scroll",
    border: "1px solid #ddd",
    borderRadius: "4px",
    padding: "10px",
    marginBottom: "10px",
    backgroundColor: "#fafafa",
    display: "flex",
    flexDirection: "column", // Allow messages to stack vertically
  },
  chatInputForm: {
    display: "flex",
  },
  chatInput: {
    flex: 1,
    padding: "10px",
    fontSize: "16px",
    borderRadius: "4px",
    border: "1px solid #ddd",
  },
  sendButton: {
    padding: "10px 15px",
    fontSize: "16px",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#007bff",
    color: "#fff",
    marginLeft: "10px",
    cursor: "pointer",
  },
  firstMessageForm: {
    height: "300px",
    padding: "10px",
    marginBottom: "10px",
    display: "flex",
    flexDirection: "column", // Allow messages to stack vertically
  },
  firstMessageButton: {
    padding: "10px 15px",
    fontSize: "16px",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#007bff",
    color: "#fff",
    position: "relative",
    left: "50%",
    marginTop: "120px",
    marginLeft: "-80px",
    cursor: "pointer",
    width: "128px"
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007bff",
    color: "#fff",
    padding: "10px",
    borderRadius: "10px",
    marginBottom: "5px",
    maxWidth: "70%",
    wordBreak: "break-word", // Prevent long words from overflowing
  },
  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#f1f1f1",
    padding: "10px",
    borderRadius: "10px",
    marginBottom: "5px",
    maxWidth: "70%",
  },
  placeholder: {
    textAlign: "center",
    color: "#aaa",
  },
  // New simple loading indicator with dots
  loadingIndicator: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "10px",
    alignSelf: "flex-start",
  },
  loadingDot: {
    width: "8px",
    height: "8px",
    margin: "0 4px",
    borderRadius: "50%",
    backgroundColor: "#888",
    opacity: 0.6
  },
  avatar: {
    width: "160px", // Adjust size as needed
    height: "160px",
    borderRadius: "50%",
  },
  languageSelector: {
    marginBottom: "20px"
  }
};

export default ChatApp;