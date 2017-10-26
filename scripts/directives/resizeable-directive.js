angular.module("ngTableResize").directive('resizeable', ['resizeStorage', '$injector', function (resizeStorage, $injector) {

    function controller($scope, $element, $attrs) {

        var $ctrl = angular.extend(this, {
            table: $element,
            container: $scope.container ? $($scope.container) : $($element).parent(),
            isFirstDrag: true,
            mode: undefined,
            columns: null,
            ctrlColumns: null,
            handleColumns: null,
            resizer: null,
            cache: null,

            bindUtilityFunctions: function (table, attr, scope) {
                if (scope.bind === undefined) return;
                scope.bind.update = function () {
                    $ctrl.cleanUpAll(table);
                    $ctrl.initialiseAll(table, attr, scope);
                }
            },
            watchModeChange: function (table, attr, scope) {
                scope.$watch(function () {
                    return scope.mode;
                }, function (/*newMode*/) {
                    $ctrl.cleanUpAll(table);
                    $ctrl.initialiseAll(table, attr, scope);
                });
            },
            cleanUpAll: function (table) {
                $ctrl.isFirstDrag = true;
                $ctrl.deleteHandles(table);
            },
            resetTable: function (table) {
                $(table).outerWidth('100%');
                $(table).find('th').width('auto');
            },
            deleteHandles: function (table) {
                $(table).find('th').find('.handle').remove();
            },
            initialiseAll: function (table, attr, scope) {
                // Get all column headers
                $ctrl.columns = $(table).find('th');

                $ctrl.mode = scope.mode;
                $ctrl.saveTableSizes = angular.isDefined(scope.saveTableSizes) ? scope.saveTableSizes : true;

                // Get the resizer object for the current mode
                var ResizeModel = $ctrl.getResizer(scope, attr);
                if (!ResizeModel) return;
                $ctrl.resizer = new ResizeModel(table, $ctrl.columns, $ctrl.container);

                if ($ctrl.saveTableSizes) {
                    // Load column sizes from saved storage
                    $ctrl.cache = resizeStorage.loadTableSizes(table, scope.mode);
                }

                // Decide which columns should have a handler attached
                $ctrl.handleColumns = $ctrl.resizer.handles($ctrl.columns);

                // Decide which columns are controlled and resized
                $ctrl.ctrlColumns = $ctrl.resizer.ctrlColumns;

                // Execute setup function for the given resizer mode
                $ctrl.resizer.setup();

                // Set column sizes from cache
                $ctrl.setColumnSizes($ctrl.cache);

                // Initialise all handlers for every column
                $ctrl.handleColumns.each(function (index, column) {
                    $ctrl.initHandle(table, column);
                })
            },
            setColumnSizes: function (cache) {
                if (!cache) {
                    return;
                }
                // $($ctrl.table).width('auto');
                $ctrl.ctrlColumns.each(function (index, column) {
                    var id = $(column).attr('id');
                    var cacheWidth = cache[id];
                    $(column).css({width: cacheWidth});
                });
                $ctrl.resizer.onTableReady();
            },
            initHandle: function (table, column) {
                // Prepend a new handle div to the column
                var handle = $('<div>', {
                    class: 'handle'
                });
                $(column).prepend(handle);

                // Make handle as tall as the table
                //$(handle).height($(table).height())

                // Use the middleware to decide which columns this handle controls
                var controlledColumn = $ctrl.resizer.handleMiddleware(handle, column)

                // Bind mousedown, mousemove & mouseup events
                $ctrl.bindEventToHandle(table, handle, controlledColumn);
            },
            bindEventToHandle: function (table, handle, column) {
                // This event starts the dragging
                $(handle).mousedown(function (event) {
                    if ($ctrl.isFirstDrag) {
                        $ctrl.resizer.onFirstDrag(column, handle);
                        $ctrl.resizer.onTableReady();
                        $ctrl.isFirstDrag = false;
                    }

                    var optional = {};
                    if ($ctrl.resizer.intervene) {
                        optional = $ctrl.resizer.intervene.selector(column);
                        optional.column = optional;
                        optional.orgWidth = $(optional).width();
                    }

                    // Prevent text-selection, object dragging ect.
                    event.preventDefault();

                    // Change css styles for the handle
                    $(handle).addClass('active');

                    // Show the resize cursor globally
                    $('body').addClass('table-resize');

                    // Get mouse and column origin measurements
                    var orgX = event.clientX;
                    var orgWidth = $(column).width();

                    // On every mouse move, calculate the new width
                    $(window).mousemove($ctrl.calculateWidthEvent(column, orgX, orgWidth, optional));

                    // Stop dragging as soon as the mouse is released
                    $(window).one('mouseup', $ctrl.unbindEvent(handle));

                })
            },
            calculateWidthEvent: function (column, orgX, orgWidth, optional) {
                return function (event) {
                    // Get current mouse position
                    var newX = event.clientX;

                    // Use calculator function to calculate new width
                    var diffX = newX - orgX;
                    var newWidth = $ctrl.resizer.calculate(orgWidth, diffX);

                    if (newWidth < $ctrl.getMinWidth(column)) return;
                    if ($ctrl.resizer.restrict(newWidth)) return;

                    // Extra optional column
                    if ($ctrl.resizer.intervene) {
                        var optWidth = $ctrl.resizer.intervene.calculator(optional.orgWidth, diffX);
                        if (optWidth < $ctrl.getMinWidth(optional.column)) return;
                        if ($ctrl.resizer.intervene.restrict(optWidth)) return;
                        $(optional.column).width(optWidth)
                    }
                    // Set size
                    $ctrl.resizer.applyWidth(newWidth, $(column));
                }
            },
            getMinWidth: function (column) {
                // "25px" -> 25
                return parseInt($(column).css('min-width')) || 0;
            },
            getResizer: function (scope, attr) {
                try {
                    var mode = attr.mode ? scope.mode : 'BasicResizer';
                    var Resizer = $injector.get(mode);
                    return Resizer;
                } catch (e) {
                    console.error("The resizer " + scope.mode + " was not found");
                    return null;
                }
            },
            unbindEvent: function (handle) {
                // Event called at end of drag
                return function (/*event*/) {
                    $(handle).removeClass('active');
                    $(window).unbind('mousemove');
                    $('body').removeClass('table-resize');

                    $ctrl.resizer.onEndDrag();

                    $ctrl.saveColumnSizes();
                }
            },
            saveColumnSizes: function () {
                if (!$ctrl.saveTableSizes) return;

                if (!$ctrl.cache) $ctrl.cache = {};
                $(columns).each(function (index, column) {
                    var id = $(column).attr('id');
                    if (!id) return;
                    $ctrl.cache[id] = $ctrl.resizer.saveAttr(column);
                });
                resizeStorage.saveTableSizes($ctrl.table, $ctrl.mode, $ctrl.cache);
            }
        });

        // Add css styling/properties to table
        $($ctrl.table).addClass('resize');

        // Initialise handlers, bindings and modes
        this.initialiseAll($element, $attrs, $scope);

        // Bind utility functions to scope object
        this.bindUtilityFunctions($element, $attrs, $scope);

        // Watch for mode changes and update all
        this.watchModeChange($element, $attrs, $scope);
    }


    // Return this directive as a object literal
    return {
        restrict: 'A',
        controller: controller,
        scope: {
            mode: '=',
            // whether to save table sizes; default true
            saveTableSizes: '=?',
            bind: '=',
            container: '@'
        }
    };

}]);
