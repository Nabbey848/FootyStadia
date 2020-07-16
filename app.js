require('dotenv').config();

const express = require("express"),
	app = express(),
	request = require("request"),
	bodyParser = require("body-parser"),
	mongoose = require("mongoose"),
	methodOverride = require("method-override"),
	flash = require("connect-flash"),
	passport = require("passport"),
	LocalStrategy = require("passport-local"),
	Stadium = require("./models/stadium"),
	Comment = require("./models/comments"),
	User = require("./models/user"),
	NodeGeocoder = require('node-geocoder');
 
const options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
 
const geocoder = NodeGeocoder(options);



mongoose.connect("mongodb://localhost/Footy_Stadia", {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set('useFindAndModify', false);


app.use(bodyParser.urlencoded({extended: true}));

//tells express to render ejs files
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(methodOverride("_method"));
app.use(flash());
app.locals.moment = require('moment');

//=================
//PASSPORT CONFIG
//=================

app.use(require("express-session")({
	secret: "",
	resave: false,
	saveUninitialized: false
}));


app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(function(req, res, next){
	res.locals.currentUser = req.user;
	res.locals.error = req.flash("error");
	res.locals.success = req.flash("success");
	next();
});

//==================
//APP LOGIC STARTS
//==================


app.get("/", function(req, res){
	res.render("landing");
});

app.get("/stadiums", function(req, res){
	if (req.query.search) {
		const regex = new RegExp(escapeRegex(req.query.search), 'gi');
		Stadium.find({name: regex}, function(err, allstadiums){
		if(err){
			console.log(err);
			console.log(req.user);
		}
		else{
			res.render("stadiums/index", {stadiums: allstadiums, currentUser: req.user});
		}
	});
	}
	else{
	Stadium.find({}, function(err, allstadiums){
		if(err){
			console.log(err);
			console.log(req.user);
		}
		else{
			res.render("stadiums/index", {stadiums: allstadiums, currentUser: req.user});
		}
	});
	}
});

app.post("/stadiums", isLoggedInAdmin, function(req, res){
	let name = req.body.name;
	let image = req.body.image;
	let desc = req.body.description;
	let author = {
      id: req.user._id,
      username: req.user.username
	}
	geocoder.geocode(req.body.location, function (err, data) {
    if (err || !data.length) {
      req.flash('error', 'Invalid address');
      return res.redirect('back');
    }
    let lat = data[0].latitude;
    let lng = data[0].longitude;
    let location = data[0].formattedAddress;
    let newStadium = {name: name, image: image, description: desc, author:author, location: location, lat: lat, lng: lng};
    // Create a new Stadium and save to DB
    Stadium.create(newStadium, function(err, newlyCreated){
        if(err){
            console.log(err);
        } else {
            //redirect back to stadiums page
            console.log(newlyCreated);
            res.redirect("/stadiums");
        }
    });
  });
});

app.get("/stadiums/new", isLoggedInAdmin, function(req, res){
	res.render("stadiums/new");
});

//SHOW ROUTE
app.get("/stadiums/:id", function(req, res){
	//pass foundStadium from database to camppground in ejs file
	Stadium.findById(req.params.id).populate("comments").exec(function(err, foundStadium){
		if(err){
			console.log(err);
		}
		else{
			res.render("stadiums/show", {stadium: foundStadium});
		}
	});
	
});

//========================
//COMMENTS ROUTES
//=========================

app.get("/stadiums/:id/comments/new", isLoggedIn, function(req, res){
	Stadium.findById(req.params.id, function(err, foundStadium){
		if(err){
			console.log(err);
		}
		else{
			res.render("comments/new", {stadium: foundStadium});
		}
	})

});

app.post("/stadiums/:id/comments", isLoggedIn, function(req, res){
	Stadium.findById(req.params.id, function(err, stadium){
		if(err){
			console.log(err);
		}
		else{
			Comment.create(req.body.comments, function(err, comment){
				if(err){
					req.flash("error", "Something went wrong");
					console.log(err);
				}
				else{
					comment.author.id = req.user._id;
					comment.author.username = req.user.username;
					comment.save();
					stadium.comments.push(comment);
					stadium.save();
					req.flash("success", "Successfully added comment");
					res.redirect("/stadiums/" + stadium._id);
			
				}
			});
		}
	})
	
});

//==========================================
//AUTHENTICATION ROUTES
//==========================================
app.get("/register", function(req, res){
	res.render("register");
});

//handle sign up logic

app.post("/register", function(req, res){
	let newUser = new User({username: req.body.username});
	if(req.body.adminCode === ""){
		newUser.isAdmin = true;
	}
	User.register(newUser, req.body.password, function(err, user){
		if(err){
			req.flash("error", "Try something else...");
			return res.render("register");
		}
		passport.authenticate("local")(req, res, function(){
			req.flash("success", "Welcome to Footy Stadia " + user.username);
			res.redirect("/stadiums");
		});
	});
});


//login form

app.get("/login", function(req, res){
	res.render("login");
});

//login logic

app.post("/login", passport.authenticate("local", {successRedirect: "/stadiums", failureRedirect: "/login"}), function (req, res){
});

//LOGOUT LOGIC
app.get("/logout", function(req, res){
	req.logout();
	req.flash("success", "Successfully logged out!");
	res.redirect("/stadiums");
});

//========================
//CAMPGROUUND EDIT LOGIC
//=========================

app.get("/stadiums/:id/edit", checkStadiumOwnership, function(req, res){
		if(req.isAuthenticated()){
			Stadium.findById(req.params.id, function(err, foundStadium){
				res.render("edit", {stadium: foundStadium});
						
			});
		}
});

app.put("/stadiums/:id", checkStadiumOwnership, function(req, res){
	geocoder.geocode(req.body.location, function (err, data) {
    if (err || !data.length) {
      req.flash('error', 'Invalid address');
      return res.redirect('back');
    }
    req.body.stadium.lat = data[0].latitude;
    req.body.stadium.lng = data[0].longitude;
    req.body.stadium.location = data[0].formattedAddress;

    Stadium.findByIdAndUpdate(req.params.id, req.body.stadium, function(err, stadium){
        if(err){
            req.flash("error", err.message);
            res.redirect("back");
        } else {
            req.flash("success","Successfully Updated!");
            res.redirect("/stadiums/" + stadium._id);
        }
    });
  });
});

app.delete("/stadiums/:id", checkStadiumOwnership, function(req, res){
	Stadium.findByIdAndRemove(req.params.id, function(err){
		if(err){
			res.redirect("/stadiums");
		}
		else{
			res.redirect("/stadiums");
		}
	});
});

//====================
//COMMENT EDIT LOGIC
//====================

app.get("/stadiums/:id/comments/:comment_id/edit", checkCommentOwnership, function(req, res){
	Comment.findById(req.params.comment_id, function(err, foundComment){
		if(err){
			res.redirect("back");
		}
		else{
			res.render("comments/edit", {stadium_id: req.params.id, comment: foundComment});
		}
	});
});
app.put("/stadiums/:id/comments/:comment_id/", checkCommentOwnership, function(req, res){
	Comment.findByIdAndUpdate(req.params.comment_id, req.body.comments, function(err, updatedComment){
		if(err){
			res.redirect("back");
		}
		else{
			res.redirect("/stadiums/" + req.params.id);
		}
	});
	
});

app.delete("/stadiums/:id/comments/:comment_id/", checkCommentOwnership, function(req, res){
	Comment.findByIdAndRemove(req.params.comment_id, function(err){
		if(err){
			res.redirect("back");
		}
		else{
			req.flash("success", "Comment deleted.");
			res.redirect("/stadiums/" + req.params.id);
		}
	})
});

//=================
//MIDDLEWARE
//=================

function isLoggedIn(req, res, next){
	if(req.isAuthenticated()){
		return next();
	}
	req.flash("error", "You need to be logged in to do that.");
	res.redirect("/login");
};

function isLoggedInAdmin(req, res, next){
	if(req.isAuthenticated() && req.user.isAdmin){
		return next();
	}
	req.flash("error", "You need to be an Admin to do that.");
	res.redirect("/login");
};

function checkStadiumOwnership(req, res, next){
	if(req.isAuthenticated()){
			Stadium.findById(req.params.id, function(err, foundStadium){
					if(err){
						req.flash("error", "Camground not found");
						res.redirect("/stadiums");
					}
					else{
					
					if(!foundStadium){
						req.flash("error", "Item was not found");
						return res.redirect("back");
					}						
						if(foundStadium.author.id.equals(req.user._id) || req.user.isAdmin){
							next();
						}
						else{
							req.flash("error", "Access Denied");
							res.redirect("back");
						}
						
					}
			});
		}
		else{
			req.flash("error", "You need to be logged in to do that.")
			res.redirect("back");
		}
};

function checkCommentOwnership(req, res, next){
	if(req.isAuthenticated()){
			Comment.findById(req.params.comment_id, function(err, foundComment){
					if(err){
						res.redirect("/stadiums");
					}
					else{
						
						if(foundComment.author.id.equals(req.user._id) || req.user.isAdmin){
							next();
						}
						else{
							req.flash("error", "Access Denied");
							res.redirect("back");
						}
						
					}
			});
		}
		else{
			res.redirect("back");
		}
};

//==============
//SEARCH FUNCTION
//===============

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};


//=================
//Error Page
//=================


app.get("*", function(req, res){
	res.render("error");
});


app.listen(3000, function(){
	console.log("Footy Stadia serving on port 3000!")
});
