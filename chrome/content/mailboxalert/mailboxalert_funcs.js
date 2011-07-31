MailboxAlert.showMethods = function (obj) {
    dump("[Object] Type: " + obj + "\n");
    for (var id in obj) {
        try {
            if (typeof(obj[id]) == "function") {
                dump("[Object] " + id + ": " + obj[id].toString() + "\n");
            }
        } catch (err) {
            result.push("[Object] " + id + ": inaccessible\n");
        }
    }
}

MailboxAlert.createUrlListener = function () {
    this.running = false;
    dump("[XX] UrlListener created\n");
    this.OnStartRunningUrl = function (aUrl) {
        dump("[XX] UrlListener started\n");
        this.running = true;
    }
    this.OnStopRunningUrl = function (aUrl, aExitCode) {
        dump("[XX] UrlListener stopped\n");
        this.running = false;
    }
    this.wait = function() {
        while(this.running) {};
    }
    return this;
}

MailboxAlert.createAlertData = function (mailbox, last_unread) {
    this.mailbox = mailbox;
    this.last_unread = last_unread;

    this.deriveData = function() {
        // derived data that changes
        this.folder_name = MailboxAlert.getFullFolderName(this.mailbox, false);
        this.folder_name_with_server = MailboxAlert.getFullFolderName(this.mailbox, true);
        this.folder_uri = this.mailbox.URI;
        this.all_message_count = this.mailbox.getNumUnread(true);
        this.folder_is_server = this.mailbox.isServer;
    }
    this.deriveFakeData = function() {
        // derived data that changes
        this.folder_name = "SomeFolder";
        this.folder_name_with_server = "SomeServer/SomeFolder";
        this.folder_uri = "IMAP://SomeServer/SomeFolder";
        this.all_message_count = 42;
    }
    
    this.deriveDataFixed = function() {
        // derived data that stays the same
        this.orig_mailbox = this.mailbox;
        this.server = MailboxAlert.getServerName(this.mailbox);
        this.message_count = this.mailbox.getNumUnread(false);
        this.msg_uri = this.mailbox.getUriForMsg(this.last_unread);

        this.subject = this.last_unread.mime2DecodedSubject;
        // add Re: if necessary
        if (this.last_unread.flags & 0x00000010) {
            this.subject = "Re: " + this.subject;
        }
        this.sender = this.last_unread.mime2DecodedAuthor;
        this.sender_name = this.sender;
        this.sender_address = this.sender;
        if (this.sender.indexOf('<') > 0 && this.sender.indexOf('>') > 0) {
            this.sender_name = this.sender.substring(0, this.sender.indexOf('<'));
            this.sender_address = this.sender.substring(this.sender.indexOf('<') + 1, this.sender.indexOf('>'));
        }
        // is there a more default default?
        this.charset = "ISO-8859-1";
        // not all folders have charset
        // some messages have charset
        try {
            this.charset = this.last_unread.Charset;
        } catch (e) {
            // ignore
        }
        if (this.charset == "ISO-8859-1") {
            try {
                this.charset = this.mailbox.charset;
            } catch (e) {
                // ignore
            }
        }
        this.messageBytes = this.last_unread.messageSize;
        this.date = this.last_unread.date;
    }

    if (!this.last_unread) {
        // this is a fake message, create some test data 
        this.last_unread = {};
        this.last_unread.mime2DecodedSubject = "Test subject";
        this.last_unread.mime2DecodedAuthor = "Theo Est <test@example.com>";
        this.last_unread.Charset = "ISO-8859-1";
        this.last_unread.messageSize = 1;
        now = new Date();
        this.last_unread.date = now.getTime();
        this.last_unread.preview = "This is a test message body. There is not much to see here. Though one might notice the text being wrapped, while the original text is one line.\n\nYour friendly neighborhood Extension Developer.\n";
        this.last_unread.getProperty = function(propname) {
            return this.preview;
        }
        this.preview_fetched = true;
    } else {
        this.preview_fetched = false;
    }
    
    if (this.mailbox) {
        this.deriveData();
        this.deriveDataFixed();
    } else {
        this.deriveFakeData();
    }
    
    // internal state variables
    this.orig_folder_name = this.folder_name;
    this.is_parent = false;
        

    // Returns the preview text
    // Fetches it on the first call to this function
    this.getPreview = function() {
        if (!this.preview_fetched) {
            dump("[XX] fetching preview\n");
            // call on last_unread folder, not our own mailbox
            // (we may have the parent by now)
            var url_listener = MailboxAlert.createUrlListener();
            var urlscalled = false;
            // API changed from TB2 to TB3, first try TB3 API, if
            // exception, try the other one
            try {
                urlscalled = this.last_unread.folder.fetchMsgPreviewText(
                                        [this.last_unread.messageKey],
                                        1, false, url_listener);
            } catch(e) {
				try {
	                var aOutAsync = {};
	                this.last_unread.folder.fetchMsgPreviewText(
	                          [this.last_unread.messageKey],
	                          1, false, url_listener, aOutAsync);
	                if (aOutAsync && aOutAsync.value) {
	                    urlscalled = true;
	                }
				} catch(e2) {
					// On some folders (news for instance), and in
					// some other cases, fetch just throws an exception
					// if so, just set an empty previewtext
					this.last_unread.setProperty("preview", "<empty>");
				}
            }
            dump("[XX] urlscalled: " + urlscalled + "\n");
            if (urlscalled) {
                dump("[XX] waiting for url_listener\n");
                url_listener.wait();
            }
            this.preview_fetched = true;
            dump("[XX] fetched\n");
        }
        return this.last_unread.getProperty("preview");
    }
    
    // Changes the alert data to call for the parent folder
    this.toParent = function() {
        this.mailbox = this.mailbox.parent;
        
        // reinit derived data
        this.deriveData();
        
        this.is_parent = true;
    }
    
    this.getInfo = function() {
        result = "";
        result += "mailbox: " + this.mailbox + "\n";
        result += "last_unread: " + this.last_unread + "\n";
        result += "\n";
        result += "folder_name: " + this.folder_name + "\n";
        result += "folder_name_with_server: " + this.folder_name_with_server + "\n";
        result += "folder_uri: " + this.folder_uri + "\n";
        result += "message_count: " + this.message_count + "\n";
        result += "all_message_count: " + this.all_message_count + "\n";
        result += "\n";
        result += "preview_fetched: " + this.preview_fetched+ "\n";
        result += "orig_folder_name: " + this.orig_folder_name + "\n";
        result += "is_parent: " + this.is_parent + "\n";
        result += "\n";
        result += "orig_mailbox: " + this.orig_mailbox + "\n";
        result += "sender: " + this.sender + "\n";
        result += "sender_name: " + this.sender_name + "\n";
        result += "sender_address: " + this.sender_address + "\n";
        result += "charset: " + this.charset + "\n";
        result += "messageBytes: " + this.messageBytes + "\n";
        result += "date: " + this.date + "\n";
        return result;
    };
    
    return this;
}

MailboxAlert.muted = function () {
    // If we ever need more than 1 global setting, make a GlobalPrefs like Prefs
    var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
    var muted = prefs.getBoolPref("extensions.mailboxalert.mute");
    dump("[XX] muted: " + muted + "\n");
    return muted;
}

MailboxAlert.addToQueue = function (folder, message) {
    /* if this was just a move action, the message is probably not new */
    if (!message.isRead) {
        var cur_l = MailboxAlert.queue_length;
        var i = 0;
        for (i = 0; i < cur_l; i++) {
            if (MailboxAlert.queue_s[i] && MailboxAlert.queue[i] == folder) {
                /* set to new message */
                MailboxAlert.queue_message[i] = message;
                return;
            }
        }

        if (MailboxAlert.queue_length < MailboxAlert.max_queue_length) {
            dump("[mailboxalert] added folder to queue: ");
            dump(MailboxAlert.getFullFolderName(folder, true));
            dump("\r\n");
            MailboxAlert.queue[MailboxAlert.queue_length] = folder;
            MailboxAlert.queue_message[MailboxAlert.queue_length] = message;
            MailboxAlert.queue_s[MailboxAlert.queue_length] = true;
            MailboxAlert.queue_length++;
        } else {
            dump("[mailboxalert] max queue length (");
            dump(MailboxAlert.max_queue_length);
            dump(") reached (current queue ");
            dump(MailboxAlert.queue_length);
            dump(") , dropping message for: ");
            dump(MailboxAlert.getFullFolderName(folder, true));
            dump("\r\n");
        }
        if (!MailboxAlert.running) {
            MailboxAlert.running = true;
            var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
            try {
                var delay = prefs.getIntPref("extensions.mailboxalert.alert_delay");
                dump("[XX] setting timeout to handle queue\n");
                setTimeout('MailboxAlert.queueHandler()', delay * 1000);
            } catch (e) {
                dump("[XX] setting timeout to handle queue default\n");
                setTimeout('MailboxAlert.queueHandler()', MailboxAlert.initial_wait_time);
            }
        } else {
            dump("[XX] already running\n");
        }
    }
}

MailboxAlert.removeFromQueue = function (folder) {
    var cur_l = MailboxAlert.queue_length;
    var i = 0;
    for (i = 0; i < cur_l; i++) {
        if(MailboxAlert.queue_s[i] && MailboxAlert.queue[i] == folder) {
            dump("[mailboxalert] removing folder from queue: ");
            dump(MailboxAlert.getFullFolderName(folder, true));
            dump("\r\n");
            MailboxAlert.queue_s[i] = false;
            return;
        }
    }
    dump("[mailboxalert] unable to remove folder from queue, not present... ");
    dump(MailboxAlert.getFullFolderName(folder, true));
    dump("\r\n");
}

MailboxAlert.cleanQueue = function () {
    var cur_l = MailboxAlert.queue_length;
    var i = 0;
    var j;
    for (i = 0; i < cur_l; i++) {
        if (!MailboxAlert.queue_s[i]) {
            for (j = i + 1; j < cur_l; j++) {
                MailboxAlert.queue[j - 1] = MailboxAlert.queue[j];
                MailboxAlert.queue_s[j - 1] = MailboxAlert.queue_s[j];
                MailboxAlert.queue_message[j - 1] = MailboxAlert.queue_message[j];
            }
            cur_l--;
            i--;
        }
    }
    MailboxAlert.queue_length--;
    dump("[mailboxalert] done cleaning, queue length now ");
    dump(MailboxAlert.queue_length);
    dump("\r\n");
}

MailboxAlert.queueHandler = function () {
    MailboxAlert.running = true;
    if (MailboxAlert.queue_length > 0) {
        var i = 0;
        for (i = 0; i < MailboxAlert.queue_length; i++) {
            if (MailboxAlert.queue_s[i]) {
                var folder = MailboxAlert.queue[i];
                var last_unread = MailboxAlert.queue_message[i];

                if (!folder.gettingNewMessages) {
                    MailboxAlert.new_alert(folder, last_unread);

                    MailboxAlert.removeFromQueue(folder);

                    MailboxAlert.cleanQueue();
                } else {
                    dump("[mailboxalert] folder still getting: ");
                    dump(MailboxAlert.getFullFolderName(folder, true));
                    dump("\r\n");
                    folder.updateFolder(msgWindow);
                }
            }
        }
    }

    if (MailboxAlert.queue_length > 0) {
        setTimeout('MailboxAlert.queueHandler()', MailboxAlert.wait_time);
    } else {
        MailboxAlert.running = false;
    }
}

MailboxAlert.getHRMsgSize = function (messageBytes) {
    if (messageBytes) {
        if (messageBytes / 1073741824 >= 1) {
            return (Math.round(messageBytes / 1048576 * 100) / 100) + "G";
        } else if (messageBytes / 1048576 >= 1) {
            return (Math.round(messageBytes / 1048576 * 100) / 100) + "M";
        } else if (messageBytes / 1024 >= 1) {
            return (Math.round(messageBytes / 1024 * 100) / 100) + "K";
        } else {
            return messageBytes + "B";
        }
    } else {
        return "0B";
    }
}

// If 'escape' is true, return a string where certain chars have been
// replaced by html codes.
// If 'escape' is false, just return the string
MailboxAlert.escapeHTML = function (escape, string) {
    if (!escape) {
        return string;
    }
    if (string) {
        // the literal \n should be kept
        string = string.split("\n").join("%myentercode%");

        string = string.split("&").join("&#38;");
        string = string.split("\"").join("&#34;");
        string = string.split("'").join("&#39;");
        string = string.split("<").join("&#60;");
        string = string.split(">").join("&#62;");
        string = string.split("%myentercode%").join("\n");

        return string;
    } else {
        return "";
    }
}

MailboxAlert.getFullFolderName = function (folder, include_server) {
    var folderName = "";
    var i = 0;
    while(!folder.isServer && i < MailboxAlert.max_folder_depth) {
        folderName = folder.prettiestName + "/" + folderName;
        folder = folder.parent;
        i++;
    }
    if (include_server) {
        folderName = folder.prettiestName + "/" + folderName;
    }

    return folderName;
}

MailboxAlert.getServerName = function (folder) {
    var i = 0;
    var folderName;
    while(!folder.isServer && i < MailboxAlert.max_folder_depth) {
        folderName = folder.prettiestName + "/" + folderName;
        folder = folder.parent;
        i++;
    }
    return folder.prettiestName;
}

/* split-join method for replaceAll() */
MailboxAlert.replace = function (string, oldstr, newstr) {
    var replacement = "";
    if (newstr) {
        replacement = newstr;
    }
    if (string) {
        if (oldstr) {
            return String(string).split(oldstr).join(replacement);
        } else {
            return string;
        }
    } else {
        return "";
    }
}

/* split-join method for replaceAll() */
/* also escape spaces */
MailboxAlert.replaceEscape = function (string, oldstr, newstr) {
    var escaped_new = "";
    if (newstr) {
        escaped_new = newstr.split(" ").join("\\ ");
    }
    if (string) {
        if (oldstr) {
            return string.split(oldstr).join(escaped_new);
        } else {
            return string;
        }
    } else {
        return "";
    }
}

MailboxAlert.runAlertFromFolder = function (messages) {
    enum = messages.enumerate();
    var last = enum.getNext();
    while (enum.hasMoreElements()) {
        last = enum.getNext();
    }
    //var message;
    var message = last.QueryInterface(Components.interfaces.nsIMsgDBHdr);
    MailboxAlert.new_alert(message.folder, message);
}

MailboxAlert.new_alert = function (folder, last_unread) {
    var alert_data = MailboxAlert.createAlertData(folder, last_unread);
    MailboxAlert.new_alert2(alert_data);
}

MailboxAlert.new_alert2 = function (alert_data) {
    while (true) {
        var folder_prefs = MailboxAlert.getFolderPrefs(alert_data.folder_uri);
        if (folder_prefs.hasAlerts()) {
            for (var i = 0; i < folder_prefs.alerts.length; ++i) {
                dump("[Mailboxalert] running alert " + folder_prefs.alerts[i] + "\n");
                var alert = MailboxAlert.getAlertPreferences(folder_prefs.alerts[i]);
                if (alert) {
                    alert.run(alert_data);
                }
            }
            return;
        } else {
            if (!folder_prefs.no_alert_to_parent &&
                !alert_data.folder_is_server &&
                !(!alert_data.is_parent &&
                  folder_prefs.no_alert_to_parent)) {
                dump("[Mailboxalert] No alerts were set for ");
                dump(alert_data.folder_name_with_server);
                dump(", trying parent\r\n");
                alert_data.toParent()
            } else {
                return;
            }
        }
    }
}

MailboxAlert.showMessage = function (alert_data, show_icon, icon_file, subject_pref, message, position, duration, effect, onclick) {
    dump("[XX]\n");
    dump("[XX]\n");
    MailboxAlert.showMethods(alert_data.getInfo());
    dump("[XX]\n");
    dump("[XX]\n");
    
    var message_key = alert_data.last_unread.messageKey;
    
    var folder_url = alert_data.folder_uri;

    if (!alert_data.messageBytes) {
        alert_data.messageBytes = "0";
    }
    var messageSize = MailboxAlert.getHRMsgSize(alert_data.messageBytes);
    var preview = alert_data.getPreview();
    dump("[XX] preview:\n");
    dump(preview);
    dump("\n[XX] end of preview\n");
    var date_obj = new Date();
    date_obj.setTime(alert_data.date);
    var date_str = date_obj.toLocaleDateString();
    var time_str = date_obj.toLocaleTimeString();
    
    subject_pref = MailboxAlert.replace(subject_pref, "%server", alert_data.server);
    subject_pref = MailboxAlert.replace(subject_pref, "%originalfolder", alert_data.orig_folder_name);
    subject_pref = MailboxAlert.replace(subject_pref, "%folder", alert_data.folder_name);
    subject_pref = MailboxAlert.replace(subject_pref, "%countall", "" + alert_data.all_message_count);
    subject_pref = MailboxAlert.replace(subject_pref, "%count", "" + alert_data.message_count);
    subject_pref = MailboxAlert.replace(subject_pref, "%subject", alert_data.subject);
    subject_pref = MailboxAlert.replace(subject_pref, "%senderaddress", alert_data.sender_address);
    subject_pref = MailboxAlert.replace(subject_pref, "%sendername", alert_data.sender_name);
    subject_pref = MailboxAlert.replace(subject_pref, "%sender", alert_data.sender);
    subject_pref = MailboxAlert.replace(subject_pref, "%charset", alert_data.charset);
    subject_pref = MailboxAlert.replace(subject_pref, "%messagebytes", alert_data.messageBytes);
    subject_pref = MailboxAlert.replace(subject_pref, "%messagesize", messageSize);
    subject_pref = MailboxAlert.replace(subject_pref, "%date", date_str);
    subject_pref = MailboxAlert.replace(subject_pref, "%time", time_str);
    //subject_pref = MailboxAlert.replace(subject_pref, "%enter", "\n");
    subject_pref = MailboxAlert.replace(subject_pref, "%msg_preview", preview);
    subject_pref = MailboxAlert.replace(subject_pref, "%msg_uri", alert_data.msg_uri);
    if (subject_pref.indexOf("%body" > 0)) {
		subject_pref = MailboxAlert.replace(subject_pref, "%body", alert_data.getPreview());
	}

    var message_text = message;
    dump("[XX] Original Message text: " + message_text + "\n");
    message_text = MailboxAlert.replace(message_text, "%server", alert_data.server);
    message_text = MailboxAlert.replace(message_text, "%originalfolder", alert_data.orig_folder_name);
    message_text = MailboxAlert.replace(message_text, "%folder", alert_data.folder_name);
    message_text = MailboxAlert.replace(message_text, "%countall", "" + alert_data.all_message_count);
    message_text = MailboxAlert.replace(message_text, "%count", "" + alert_data.message_count);
    message_text = MailboxAlert.replace(message_text, "%subject", alert_data.subject);
    message_text = MailboxAlert.replace(message_text, "%senderaddress", alert_data.sender_address);
    message_text = MailboxAlert.replace(message_text, "%sendername", alert_data.sender_name);
    message_text = MailboxAlert.replace(message_text, "%sender", alert_data.sender);
    message_text = MailboxAlert.replace(message_text, "%charset", alert_data.charset);
    message_text = MailboxAlert.replace(message_text, "%messagebytes", alert_data.messageBytes);
    message_text = MailboxAlert.replace(message_text, "%messagesize", messageSize);
    message_text = MailboxAlert.replace(message_text, "%date", date_str);
    message_text = MailboxAlert.replace(message_text, "%time", time_str);
    message_text = MailboxAlert.replace(message_text, "%enter", "\n");
    message_text = MailboxAlert.replace(message_text, "%msg_preview", preview);
    message_text = MailboxAlert.replace(message_text, "%msg_uri", alert_data.msg_uri);
    if (subject_pref.indexOf("%body" > 0)) {
		message_text = MailboxAlert.replace(message_text, "%body", alert_data.getPreview());
	}

    dump("[XX] Message text: " + message_text + "\n");

    try {
        window.openDialog('chrome://mailboxalert/content/newmailalert.xul', "new mail", "chrome,titlebar=no,popup=yes", subject_pref, message_text, show_icon, icon_file, alert_data.orig_mailbox, alert_data.last_unread, position, duration, effect, onclick);
    } catch (e) {
        alert(e);
    }
}

/* copied from mozilla thunderbird sourcecode */
MailboxAlert.playSound = function (soundURL) {
    var gSound = Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);
    gSound.init();
    if (soundURL) {
          if (soundURL.indexOf("file://") == -1) {
              soundURL = "file://" + soundURL;
          }
          try {
              var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                       .getService(Components.interfaces.nsIIOService);
              var url = ioService.newURI(soundURL, null, null);
              dump("gSound.play("+soundURL+")\n");
              gSound.play(url);
              dump("sound played\n");
          } catch(e) {
              // some error, just 'beep' (which is system-dependent
              // these days)
              dump("[XX] exception playing sound: " + e);
              gSound.beep();
          }
    } else {
        gSound.beep();
    }
}

MailboxAlert.executeCommand = function (alert_data, command, escape_html) {
    var date_obj = new Date();
    date_obj.setTime(alert_data.date);
    var date_str = date_obj.toLocaleDateString()
    var time_str = date_obj.toLocaleTimeString()

    command = MailboxAlert.replaceEscape(command, "%alert_data.server", MailboxAlert.escapeHTML(alert_data.server));
    command = MailboxAlert.replaceEscape(command, "%originalalert_data.folder_name_with_server", MailboxAlert.escapeHTML(alert_data.folder_name_with_server));
    command = MailboxAlert.replaceEscape(command, "%alert_data.folder_name_with_server", MailboxAlert.escapeHTML(alert_data.folder_name_with_server));
    command = MailboxAlert.replaceEscape(command, "%countall", ""+alert_data.all_message_count);
    command = MailboxAlert.replaceEscape(command, "%count", ""+alert_data.orig_message_count);
    command = MailboxAlert.replaceEscape(command, "%alert_data.subject", MailboxAlert.escapeHTML(alert_data.subject));
    command = MailboxAlert.replaceEscape(command, "%senderaddress", MailboxAlert.escapeHTML(alert_data.sender_address));
    command = MailboxAlert.replaceEscape(command, "%sendername", MailboxAlert.escapeHTML(alert_data.sender_name));
    command = MailboxAlert.replaceEscape(command, "%sender", MailboxAlert.escapeHTML(alert_data.sender));
    command = MailboxAlert.replaceEscape(command, "%charset", MailboxAlert.escapeHTML(alert_data.charset));
    command = MailboxAlert.replace(command, "%messagebytes", alert_data.message_bytes);
    command = MailboxAlert.replace(command, "%messagesize", alert_data.messageSize);
    command = MailboxAlert.replace(command, "%date", MailboxAlert.escapeHTML(date_str));
    command = MailboxAlert.replace(command, "%time", MailboxAlert.escapeHTML(time_str));
    command = MailboxAlert.replace(command, "%msg_preview", MailboxAlert.escapeHTML(alert_data.getPreview()));
    command = MailboxAlert.replace(command, "%msg_uri", MailboxAlert.escapeHTML(alert_data.msg_uri));

    var args = new Array();
    var prev_i = 0;
    var i = 0;
    dump("command now: " + command + "\n");

    var env = Components.classes["@mozilla.org/process/environment;1"].createInstance(Components.interfaces.nsIEnvironment);
    var csconv = Components.classes["@mozilla.org/intl/saveascharset;1"].createInstance(Components.interfaces.nsISaveAsCharset);
    var tocharset = env.get("LANG").split(".")[1];

    dump("Command to execute: ");
    dump(command);
    dump("\n");
    var i = 0;
    for (i; i < command.length; i++) {
        if (command.substr(i, 1) == " ") {
            if (i > 0 && command.substr(i-1, 1) != "\\") {
                var cur_arg = command.substring(prev_i, i);
                // remove escapes again
                cur_arg = cur_arg.split("\\ ").join(" ");

                /* convert every argument (i.e. everything but the
                 * first) to native charset */
                if (prev_i > 0) {
                    if (alert_data.charset && tocharset) {
                        csconv.Init(tocharset, 0, 0);
                        try {
                            cur_arg = csconv.Convert(cur_arg);
                        } catch (e) {
                            dump("Error converting " + cur_arg + ", leaving as is\n");
                        }
                    }
                }
                args.push(cur_arg);
                prev_i = i + 1;
            } else {
                //alert("space at pos "+i+" is escaped: "+command.substr(i-1, 1));
            }
        }
    }
    /* also convert this one */
    if (alert_data.charset && tocharset) {
        csconv.Init(tocharset, 0, 0);
        try {
            args.push(csconv.Convert(command.substr(prev_i, i).split("\\ ").join(" ")));
        } catch (e) {
            // conversion failed, just push whatever we had
            args.push(command.substr(prev_i, i).split("\\ ").join(" "));
        }
    } else {
        args.push(command.substr(prev_i, i).split("\\ ").join(" "));
    }
    var executable_name = args.shift();
    dump("Executable: ");
    dump(executable_name);
    dump("\n");
    try {
        var exec = Components.classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsILocalFile);
        var pr = Components.classes["@mozilla.org/process/util;1"].
        createInstance(Components.interfaces.nsIProcess);

        exec.initWithPath(executable_name);
        // isExecutable is horribly broken in OSX, see
        // https://bugzilla.mozilla.org/show_bug.cgi?id=322865
        // It turns out to be broken in windows too...
        // removing the check, we shall have to try and run it
        // then catch NS_UNEXPECTED
        if (!exec.exists()) {
            var stringsBundle = document.getElementById("string-bundle");
            alert(stringsBundle.getString('mailboxalert.error')+"\n" + exec.leafName + " " + stringsBundle.getString('mailboxalert.error.notfound') + "\n\nFull path: "+executable_name+"\n\n" + stringsBundle.getString('mailboxalert.error.disableexecutefor') + " " + alert_data.folder_name_with_server);
            dump("Failed command:  " +executable_name + "\r\n");
            dump("Arguments: " + args + "\r\n");
            var caller = window.arguments[0];
            if (caller) {
                var executecommandcheckbox = document.getElementById('mailboxalert_execute_command');
                executecommandcheckbox.checked = false;
                setUIExecuteCommandPrefs(false);
            } else {
                var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
                prefs.setBoolPref("extensions.mailboxalert.execute_command." + alert_data.folder_name_with_server, false);
            }
        } else {
            dump("Command:  " +executable_name + "\r\n");
            dump("Arguments: " + args + "\r\n");
            var res1 = pr.init(exec);
            var result = pr.run(false, args, args.length);
        }
    } catch (e) {
        if (e.name == "NS_ERROR_FAILURE" ||
            e.name == "NS_ERROR_UNEXPECTED"
           ) {
            var stringsBundle = document.getElementById("string-bundle");
            alert(stringsBundle.getString('mailboxalert.error')+"\n" + exec.leafName + " " + stringsBundle.getString('mailboxalert.error.notfound') + "\n\nFull path: "+executable_name+"\n\n" + stringsBundle.getString('mailboxalert.error.disableexecutefor') + " " + folder);
            if (caller) {
                var executecommandcheckbox = document.getElementById('mailboxalert_execute_command');
                executecommandcheckbox.checked = false;
                setUIExecuteCommandPrefs(false);
            } else {
                var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
                prefs.setBoolPref("extensions.mailboxalert.execute_command." + folder, false);
            }
        } else if (e.name == "NS_ERROR_FILE_UNRECOGNIZED_PATH") {
            dump("NS_ERROR_FILE_UNRECOGNIZED_PATH\n");
            var stringsBundle = document.getElementById("string-bundle");
            alert(stringsBundle.getString('mailboxalert.error') + "\r\n\r\n" +
                  stringsBundle.getString('mailboxalert.error.badcommandpath1') + 
                  " " + alert_data.folder_name_with_server + " " +
                  stringsBundle.getString('mailboxalert.error.badcommandpath2')  +
                  "\r\n\r\n" +
                  stringsBundle.getString('mailboxalert.error.disableexecutefor') + " " + alert_data.folder_name_with_server);
                    var caller = window.arguments[0];
            if (caller) {
                var executecommandcheckbox = document.getElementById('mailboxalert_execute_command');
                executecommandcheckbox.checked = false;
                setUIExecuteCommandPrefs(false);
            } else {
                var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
                prefs.setBoolPref("extensions.mailboxalert.execute_command." + alert_data.folder_name_with_server, false);
            }
        } else {
            throw e;
        }
    }
}

// Function to create one menu item as used in fillFolderMenu
MailboxAlert.createMenuItem = function (label, value) {
    const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    var item = document.createElementNS(XUL_NS, "menuitem"); // create a new XUL menuitem
    item.setAttribute("label", label);
    if (value) {
        item.setAttribute("value", value);
    }
    return item;
}

MailboxAlert.createMenuSeparator = function () {
    const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    var item = document.createElementNS(XUL_NS, "menuseparator"); // create a new XUL menuitem
    return item;
}

MailboxAlert.fillFolderMenu = function(alert_menu, folder) {
    var folder_prefs = MailboxAlert.getFolderPrefs(folder.URI);
    var all_alerts = MailboxAlert.getAllAlertPrefs();
    var stringsBundle = document.getElementById("string-bundle");
    var alert_menuitem;
    var alerts_set = false;

    // clear it first
    while (alert_menu.firstChild) {
        alert_menu.removeChild(alert_menu.firstChild);
    }

    for (var alert_i = 0; alert_i < all_alerts.length; ++alert_i) {
        var alert = all_alerts[alert_i];
        var alert_index = alert.index;
        alert_menuitem = MailboxAlert.createMenuItem(alert.get("name"), alert_index);
        if (folder_prefs.alertSelected(alert_index)) {
            alert_menuitem.setAttribute("checked", true);
            alerts_set = true;
        }
        alert_menuitem.setAttribute("oncommand", "MailboxAlert.switchFolderAlert('"+ folder.URI + "', " + alert_index + ");");
        alert_menu.appendChild(alert_menuitem);
    }

    alert_menu.appendChild(MailboxAlert.createMenuSeparator());

    alert_menuitem = MailboxAlert.createMenuItem(stringsBundle.getString('mailboxalert.menu.alertforchildren'));
    if (folder_prefs.alert_for_children) {
        alert_menuitem.setAttribute("checked", true);
    }
    alert_menuitem.setAttribute("oncommand", "MailboxAlert.switchAlertForChildren('" + folder.URI + "');");
    // disable it if there are no alerts set
    if (!alerts_set) {
        alert_menuitem.setAttribute("disabled", true);
    }
    alert_menu.appendChild(alert_menuitem);

    alert_menuitem = MailboxAlert.createMenuItem(stringsBundle.getString('mailboxalert.menu.noalerttoparent'));
    if (folder_prefs.no_alert_to_parent) {
        alert_menuitem.setAttribute("checked", true);
    }
    alert_menuitem.setAttribute("oncommand", "MailboxAlert.switchNoAlertToParent('" + folder.URI + "');");
    // disable it if there are any alerts set
    if (alerts_set) {
        alert_menuitem.setAttribute("disabled", true);
    }
    alert_menu.appendChild(alert_menuitem);

    alert_menu.appendChild(MailboxAlert.createMenuSeparator());

    alert_menuitem = MailboxAlert.createMenuItem(stringsBundle.getString('mailboxalert.menu.editalerts'));
    alert_menuitem.setAttribute("oncommand", "window.openDialog('chrome://mailboxalert/content/alert_list.xul', 'mailboxalert_prefs', 'chrome');");
    alert_menu.appendChild(alert_menuitem);
}
