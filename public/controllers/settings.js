// Require App
var app = require('ui/modules').get('app/wazuh', []);
// Require utils
var base64 = require('plugins/wazuh/utils/base64.js');

app.controller('settingsController', function ($scope, $http, testConnection, appState, Notifier, $routeParams, $location) {



	// Initialize
	const notify = new Notifier({location: 'Settings'});
    $scope.formData = {};
    $scope.formData.user = "";
    $scope.formData.password = "";
    $scope.formData.url = "";
    $scope.accept_ssl = true;
    $scope.editConfiguration = true;
    $scope.menuNavItem = 'settings';
	$scope.load = true;
	$scope.currentDefault = 0;
	$scope.managerAPI = "";
	$scope.extensions = {};
	$scope.extensions.oscap = true;
	$scope.extensions.audit = true;
	$scope.extensions.pci = true;
	$scope.addManagerContainer = false;
	
	// Tabs
	
	// Default tab
	$scope.submenuNavItem = "api";
	
	// URL Tab
	var tab = "";
	var view = "";
    if($routeParams.tab)
		$scope.submenuNavItem  = $routeParams.tab;
	
	// Watch tab change
	$scope.$watch('submenuNavItem', function() {
		$location.search('tab', $scope.submenuNavItem);
	});	
	
	// Remove API entry
	$scope.removeManager = function(item) {
		var index = $scope.apiEntries.indexOf(item);
		if($scope.apiEntries[index]._source.active == "true" && $scope.apiEntries.length != 1){
			notify.error("Please set another default manager before removing this one");
			return;
		}
			
		$http.delete("/api/wazuh-api/apiEntries/"+$scope.apiEntries[index]._id).success(function (data, status) {
			$scope.apiEntries.splice(index, 1);   
		}).error(function (data, status) {
			notify.error("Could not remove manager");
		})	 
	}

	// Set manager default
	$scope.setDefault = function(item) {
		var index = $scope.apiEntries.indexOf(item);
		$http.put("/api/wazuh-api/apiEntries/"+$scope.apiEntries[index]._id).success(function (data, status) {
			appState.setDefaultManager($scope.apiEntries[index]._source.manager);
			$scope.apiEntries[$scope.currentDefault]._source.active	= "false";
			$scope.apiEntries[index]._source.active	= "true";
			$scope.currentDefault = index;
			$scope.extensions = $scope.apiEntries[$scope.currentDefault]._source.extensions;
			notify.info("Manager "+$scope.apiEntries[index]._source.manager+" set as default");			
		}).error(function (data, status) {
			notify.error("Could not set that manager as default");
		})	 
	}
	
    // Get settings function
    $scope.getSettings = function () {
			$http.get("/api/wazuh-api/apiEntries").success(function (data, status) {
				$scope.apiEntries = data;
				angular.forEach($scope.apiEntries, function (value, key) {
					if(value._source.active == "true"){
						$scope.currentDefault = key;
						if(value._source.extensions){
							$scope.extensions = value._source.extensions;
						}else{
							$scope.extensions.oscap = true;
							$scope.extensions.audit = true;
							$scope.extensions.pci = true;
						}
					}
						
				});

			}).error(function (data, status) {
				notify.error("Error getting API entries");
			})
    };

    // Save settings function
    $scope.saveSettings = function () {
		var activeStatus = "false";
		if($scope.apiEntries.length == 0)
			activeStatus = "true";
		
		var tmpData = {
			'user': $scope.formData.user,
			'password': base64.encode($scope.formData.password),
			'url': $scope.formData.url,
			'port': $scope.formData.port,
			'manager': "",
			'insecure': "true",
			'active': activeStatus
		};

        testConnection.check(tmpData).then(function (data) {
			// API Check correct, get Manager name
			tmpData.manager = data;
			tmpData.extensions = {"oscap": true, "audit": true, "pci": true};
			// Insert new API entry
			$http.put("/api/wazuh-api/settings", tmpData).success(function (data, status) {
				var newEntry = {'_id': data.response._id, _source: { manager: tmpData.manager, active: tmpData.active, url: tmpData.url, api_user: tmpData.user, api_port: tmpData.port } }; 
				$scope.apiEntries.push(newEntry);
				notify.info('Wazuh API successfully added');
				$scope.addManagerContainer = false;
				$scope.formData.user = "";
				$scope.formData.password = "";
				$scope.formData.url = "";
				$scope.formData.port = "";
				// Fetch agents on demand
				$http.get("/api/wazuh-api/fetchAgents").error(function (data, status) {
					notify.error("Error fetching agents");
				});
			
			}).error(function (data, status) {
				if (status == '400') {
					notify.error("Please, fill all the fields in order to connect with Wazuh RESTful API.");
				} else {
					notify.error("Some error ocurred, could not save data in elasticsearch.");
				}
			})
		}, printError);
    };

	// Check manager connectivity
    $scope.checkManager = function (item) {
		
		var index = $scope.apiEntries.indexOf(item);
		var tmpData = {
			'user': $scope.apiEntries[$scope.currentDefault]._source.api_user,
			'password': $scope.apiEntries[$scope.currentDefault]._source.api_password,
			'url': $scope.apiEntries[$scope.currentDefault]._source.url,
			'port': $scope.apiEntries[$scope.currentDefault]._source.api_port,
			'insecure': "true"
		};

        testConnection.check(tmpData).then(function (data) {
			notify.info("Connection success");
		}, printError);
    };

    // Process form
    $scope.processForm = function () {
		$scope.messageError = "";
        // Test and Save if OK
		$scope.saveSettings();
    };

	// Toggle extension
	$scope.toggleExtension = function(extension,state) {
		if(extension == "oscap" || extension == "audit" || extension == "pci"){
			$http.put("/api/wazuh-api/extension/toggle/"+$scope.apiEntries[$scope.currentDefault]._id+"/"+extension+"/"+state).success(function (data, status) {	
			}).error(function (data, status) {
				notify.error("Invalid request when toggle extension state.");
			})
		}
	};
	
    var printError = function (data) {
        var text;
        switch (data.data) {
            case 'no_elasticsearch':
                text = 'Could not connect with elasticsearch in order to retrieve the credentials.';
                break;
            case 'no_credentials':
                text = 'Valid credentials not found in elasticsearch. It seems the credentials were not saved.';
                break;
            case 'protocol_error':
                text = 'Invalid protocol in the API url. Please, specify <b>http://</b> or <b>https://</b>.';
                break;
            case 'unauthorized':
                text = 'Credentials were found, but they are not valid.';
                break;
            case 'bad_url':
                text = 'The given URL does not contains a valid Wazuh RESTful API installation.';
                break;
            case 'self_signed':
                text = 'The request to Wazuh RESTful API was blocked, because it is using a selfsigned SSL certificate. Please, enable <b>"Accept selfsigned SSL"</b> option if you want to connect anyway.';
                break;
            case 'not_running':
                text = 'There are not services running in the given URL.';
                break;
            default:
                text = 'Unexpected error. '+data.message;
        }
        notify.error(text);
		$scope.messageError = text;
    };
	
	$scope.getAppInfo = function () {
		$http.get("/elasticsearch/.kibana/wazuh-setup/1").success(function (data, status) {
			$scope.appInfo = {};
			$scope.appInfo["app-version"] = data._source["app-version"];
			$scope.appInfo["installationDate"] = data._source["installationDate"];
			$scope.appInfo["revision"] = data._source["revision"];
		}).error(function (data, status) {
			notify.error("Error when loading Wazuh setup info");
		})
		
	}
	
	// Loading data
	$scope.getSettings();
	$scope.getAppInfo();

});



